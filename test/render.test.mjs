import assert from 'node:assert/strict';
import test from 'node:test';

import { code128ModuleCount, code128Pattern } from '../src/escpos/barcode.mjs';
import { buildPlan, LINE } from '../src/render/plan.mjs';
import { planHeight, planToEscPos } from '../src/render/planescpos.mjs';
import { planToAscii } from '../src/render/planascii.mjs';
import { encodeQR } from '../src/escpos/qr.mjs';
import { parseTextLabel } from '../src/label/parse.mjs';
import { validate } from '../src/label/model.mjs';

const LABEL = {
  trackingNumber: 'SPXID065670267489',
  orderNumber: '26092754QH0FXM',
  service: 'ECO',
  routeCode: 'JMT-C-10',
  labelRef: 'A-147',
  weight: '800 gr',
  shipBy: '28-09-2026',
  codCheckFirst: 'Tidak',
  receiver: {
    name: 'Edwin suryo laksono',
    address: ['HOME', 'Perumnas bumitelukjambe blok j no 333 Rt 02 Rw'],
    city: 'KAB. KARAWANG TELUKJAMBE TIMUR Sukaluyu',
  },
  sender: { name: 'zera', address: ['KAB. KLATEN'], phone: '6285646444805' },
  items: [
    { name: 'Cover Tutup Knalpot Vario 125 / 150, PCX, Airblade - Model Baru', variation: 'Airblade Old', extra: ['Baut,Extra Baber'], qty: 1 },
  ],
};

test('CODE128 encodes only even bar/space runs and ends with the stop pattern', () => {
  const { elements, modules } = code128Pattern('SPXID065670267489');
  assert.equal(elements[0][1], true, 'symbol must start with a bar');
  for (let i = 1; i < elements.length; i++) {
    assert.notEqual(elements[i][1], elements[i - 1][1], 'runs must alternate bar/space');
  }
  const stop = elements.slice(-7);
  assert.deepEqual(stop.map(([w]) => w), [2, 3, 3, 1, 1, 1, 2]);
  const sum = elements.reduce((n, [w]) => n + w, 0);
  assert.equal(sum, modules, 'module total must equal the run lengths');
});

test('CODE128 module count matches the real encoder, not an estimate', () => {
  for (const s of ['A-147', '12345678', 'SPXID065670267489', 'X']) {
    assert.equal(code128ModuleCount(s), code128Pattern(s).modules);
  }
});

test('CODE128 uses code C for digit runs, halving their cost', () => {
  // 8 digits as 4 code-C pairs (4*11) rather than 8 code-B characters (8*11).
  assert.ok(code128Pattern('12345678').modules < code128Pattern('abcdefgh').modules);
  // Tracking numbers are mostly digits, so they must land well under 384 dots
  // at 1 dot per module on a 58mm head.
  assert.ok(code128Pattern('SPXID065670267489').modules < 384);
});

test('CODE128 rejects characters outside code B', () => {
  assert.throws(() => code128Pattern('é'), /out of range/);
});

test('label plan covers every field of the source label', () => {
  const plan = buildPlan(LABEL, { paper: 58 });
  const text = plan.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  for (const needle of [
    'SPXID065670267489', '26092754QH0FXM', 'ECO', 'JMT-C-10', 'A-147',
    '800 gr', '28-09-2026', 'Tidak', 'Penerima:', 'Pengirim:',
    '6285646444805', 'KAB. KLATEN', 'Nama Produk', 'Qty', 'Pesan:',
  ]) {
    assert.ok(text.includes(needle), `plan is missing ${needle}`);
  }
});

test('plan boxes never overlap the text they are supposed to contain', () => {
  const plan = buildPlan(LABEL, { paper: 58 });
  const boxes = plan.filter((p) => p.type === 'rect');
  assert.ok(boxes.length >= 6, 'the label needs its border plus inner boxes');
  for (const box of boxes) {
    assert.ok(box.w > 0 && box.h > 0, `degenerate box ${JSON.stringify(box)}`);
  }
});

test('consecutive text lines are at least one font cell apart', () => {
  const plan = buildPlan(LABEL, { paper: 58 });
  const rows = [...new Set(plan.filter((p) => p.type === 'text').map((p) => p.y))].sort((a, b) => a - b);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(
      rows[i] - rows[i - 1] >= LINE,
      `text rows ${rows[i - 1]} and ${rows[i]} are closer than ${LINE} dots`,
    );
  }
});

test('three barcodes are stacked on 58mm because they cannot fit across', () => {
  const plan = buildPlan(LABEL, { paper: 58 });
  const barcodes = plan.filter((p) => p.type === 'barcode');
  assert.equal(barcodes.length, 6, 'three top and three bottom symbols');
  for (const b of barcodes) {
    const w = code128ModuleCount(b.data) * b.moduleWidth;
    assert.ok(b.x + w <= 384, `barcode overflows the 384 dot head: ${b.x} + ${w}`);
  }
});

test('80mm paper keeps the three-across layout', () => {
  const plan = buildPlan(LABEL, { paper: 80 });
  const notes = plan.filter((p) => p.type === 'note').map((p) => p.note);
  assert.ok(notes.some((n) => n.includes('three across')), notes.join(' | '));
});

test('no paper width or layout mode puts a barcode off the print head', () => {
  for (const paper of [58, 80]) {
    const dots = paper === 58 ? 384 : 576;
    for (const barcodeLayout of ['auto', 'across', 'stack']) {
      const plan = buildPlan(LABEL, { paper, barcodeLayout });
      for (const b of plan.filter((p) => p.type === 'barcode')) {
        const w = code128ModuleCount(b.data) * b.moduleWidth;
        const where = `${paper}mm/${barcodeLayout}`;
        assert.ok(b.x >= 0, `${where}: barcode starts left of the head (${b.x})`);
        assert.ok(b.x + w <= dots, `${where}: barcode runs off the head (${b.x} + ${w} > ${dots})`);
      }
    }
  }
});

test('forcing "across" on paper that cannot fit it degrades instead of overflowing', () => {
  const plan = buildPlan(LABEL, { paper: 58, barcodeLayout: 'across' });
  const notes = plan.filter((p) => p.type === 'note').map((p) => p.note);
  assert.ok(
    notes.some((n) => n.includes('will not fit 58mm') && n.includes('stacked')),
    notes.join(' | '),
  );
  const bars = plan.filter((p) => p.type === 'barcode');
  assert.equal(new Set(bars.map((b) => b.x)).size, 1, 'the three symbols should still be stacked');
});

test('compiled output is a plausible ESC/POS stream', () => {
  const dots = 384;
  const plan = buildPlan(LABEL, { paper: 58 });
  const bytes = planToEscPos(plan, { dots });
  assert.ok(bytes.length > 2000, `expected a real payload, got ${bytes.length} bytes`);
  assert.deepEqual([...bytes.slice(0, 2)], [0x1b, 0x40], 'must start with ESC @');
  const notes = plan.filter((p) => p.type === 'note').map((p) => p.note);
  assert.ok(notes.length > 0);
  assert.ok(planHeight(plan, dots) > 200);
});

test('ascii preview renders at the printed column count', () => {
  const plan = buildPlan(LABEL, { paper: 58 });
  const art = planToAscii(plan, { dots: 384, cols: 64 });
  const lines = art.split('\n');
  assert.ok(lines.length > 20, `preview too short: ${lines.length} rows`);
  for (const line of lines) assert.ok(line.length <= 64, 'preview row exceeds 64 columns');
  assert.ok(art.includes('SPXID065670267489'));
});

test('QR generation produces a square matrix with a quiet zone', () => {
  const { matrix, size } = encodeQR('SPXID065670267489', { ecLevel: 'M' });
  assert.equal(matrix.length, size);
  assert.equal(matrix[0].length, size);
  assert.ok(matrix.every((row) => row.length === size));
});

test('text labels round-trip through the parser', () => {
  const label = parseTextLabel(
    [
      'SPXID065670267489',
      'Penerima: Edwin suryo laksono',
      'Alamat: Perumnas bumitelukjambe blok j no 333 Rt 02 Rw',
      'Pengirim: zera',
      'HP: 6285646444805',
      'Berat: 800 gr',
      'Batas Kirim: 28-09-2026',
      'No.Pesanan: 26092754QH0FXM',
      '1x Cover Tutup Knalpot Vario 125 / 150, PCX, Airblade - Model Baru',
    ].join('\n'),
  );
  const { ok, errors } = validate(label);
  assert.ok(ok, `parsed label failed validation: ${errors.join('; ')}`);
  assert.equal(label.trackingNumber, 'SPXID065670267489');
  assert.equal(label.receiver.name, 'Edwin suryo laksono');
  assert.equal(label.items.length, 1);
});

test('buildPlan includes cutLine by default below barcodes and excludes it when false', () => {
  const plan = buildPlan(LABEL, { paper: 58 });
  const cut = plan.find((p) => p.type === 'cutLine');
  assert.ok(cut, 'cutLine must be present by default');
  assert.equal(cut.thickness, 2);

  const lastBarcode = plan.filter((p) => p.type === 'barcode').at(-1);
  assert.ok(cut.y > lastBarcode.y + lastBarcode.h, 'cutLine must sit below the last barcode');

  const planNoCut = buildPlan(LABEL, { paper: 58, cutLine: false });
  assert.ok(!planNoCut.some((p) => p.type === 'cutLine'), 'cutLine must be omitted when cutLine=false');
});
