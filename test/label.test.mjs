import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractBoxes } from '../src/label/pdf.mjs';
import { parseBoxes } from '../src/label/parse.mjs';
import { validate } from '../src/label/model.mjs';
import { buildPlan } from '../src/render/plan.mjs';
import { planToSvg } from '../src/render/plansvg.mjs';
import { code128ModuleCount } from '../src/escpos/barcode.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PDF = path.join(here, '..', 'assets', 'resi.pdf');

/** Parse the real sample label. */
async function sampleLabel() {
  const [page] = await extractBoxes(PDF);
  return parseBoxes(page.boxes, { source: 'pdf' });
}

/** Every drawn primitive in the SVG must sit inside the printable area. */
function svgBounds(plan, dots) {
  const svg = planToSvg(plan, { dots, paper: dots === 384 ? 58 : 80 });
  const height = Number(svg.match(/viewBox="0 0 \d+ ([\d.]+)"/)[1]);
  const bad = [];

  for (const m of svg.matchAll(/<path d="([^"]+)"/g)) {
    for (const t of m[1].matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)/g)) {
      const [x, y, w, h] = t.slice(1).map(Number);
      if (x < 0 || x + w > dots) bad.push(`barcode/qr x ${x}+${w} > ${dots}`);
      if (y < 0 || y + h > height) bad.push(`barcode/qr y ${y}+${h} > ${height}`);
    }
  }
  for (const t of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*textLength="([\d.]+)"/g)) {
    const [x, y, len] = t.slice(1).map(Number);
    if (x < 0 || x + len > dots) bad.push(`text x ${x}+${len} > ${dots} (len ${len})`);
    if (y < 0 || y > height) bad.push(`text y ${y} > ${height}`);
  }
  for (const t of svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    const [x, y, w, h] = t.slice(1).map(Number);
    if (x < 0 || x + w > dots) bad.push(`rect x ${x}+${w} > ${dots}`);
    if (y < 0 || y + h > height) bad.push(`rect y ${y}+${h} > ${height}`);
  }
  return { svg, height, bad };
}

test('the sample label parses into a valid label', async () => {
  const label = await sampleLabel();
  const { ok, errors } = validate(label);
  assert.ok(ok, errors.join('; '));
  assert.equal(label.trackingNumber, 'SPXID065670267489');
  assert.equal(label.orderNumber, '26092754QH0FXM');
  assert.equal(label.weight, '800 gr');
  assert.equal(label.items.length, 1);
});

test('the district line belongs to the receiver, not the sender', async () => {
  const { receiver, sender } = await sampleLabel();
  // "Pringgodani Bumi Telukjam" starts at x=165.5, just left of the
  // "Pengirim:" header at x=166.8, so x alone puts it in the sender column.
  // It is a continuation of the receiver's address.
  assert.ok(
    receiver.address.includes('Pringgodani Bumi Telukjam'),
    `receiver is missing the district line: ${JSON.stringify(receiver.address)}`,
  );
  assert.equal(
    sender.address.includes('Pringgodani Bumi Telukjam'),
    false,
    'the district line leaked into the sender',
  );
  assert.deepEqual(sender.address, ['KAB. KLATEN']);
});

test('the district row is rejoined into one city line', async () => {
  const { receiver } = await sampleLabel();
  assert.equal(receiver.city, 'KAB. KARAWANG TELUKJAMBE TIMUR Sukaluyu');
});

test('the sender keeps its own name, phone and address', async () => {
  const { sender, receiver } = await sampleLabel();
  assert.equal(sender.name, 'zera');
  assert.equal(sender.phone, '6285646444805');
  assert.equal(receiver.name, 'Edwin suryo laksono');
});

test('the SVG preview draws nothing outside the printable area', async () => {
  const label = await sampleLabel();
  for (const paper of [58, 80]) {
    const dots = paper === 58 ? 384 : 576;
    for (const barcodeLayout of ['auto', 'across', 'stack']) {
      const plan = buildPlan(label, { paper, barcodeLayout });
      const { bad } = svgBounds(plan, dots);
      assert.deepEqual(bad, [], `${paper}mm/${barcodeLayout}: ${bad.join('; ')}`);
    }
  }
});

test('the SVG preview is tall enough for its tallest primitive', async () => {
  const label = await sampleLabel();
  const plan = buildPlan(label, { paper: 58 });
  const { svg, height } = svgBounds(plan, 384);
  const lowest = Math.max(
    ...plan.filter((p) => p.type === 'text').map((p) => p.y + 24),
    ...plan.filter((p) => p.type === 'barcode').map((p) => p.y + p.h),
    ...plan.filter((p) => p.type === 'rect').map((p) => p.y + p.h),
  );
  assert.ok(height >= lowest, `viewBox height ${height} is short of content ${lowest}`);
  assert.ok(svg.startsWith('<svg'), 'preview must be a standalone SVG');
});

test('barcode module width stays scannable at 58mm', async () => {
  const label = await sampleLabel();
  const plan = buildPlan(label, { paper: 58 });
  for (const b of plan.filter((p) => p.type === 'barcode')) {
    assert.ok(b.moduleWidth >= 1, 'barcode collapsed to a hairline');
    const w = code128ModuleCount(b.data) * b.moduleWidth;
    assert.ok(w <= b.w, `barcode wider than its cell (${w} > ${b.w})`);
  }
});
