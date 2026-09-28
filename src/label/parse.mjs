import { extractBoxes, groupLines } from './pdf.mjs';
import { createLabel, TRACKING_RE } from './model.mjs';

/**
 * Shopee Express label parser.
 *
 * The A4 label is a two column layout: `Penerima:` (receiver) and
 * `Pengirim:` (sender) sit side by side with their address blocks stacked
 * underneath. The PDF text stream is therefore heavily out of order, so we
 * parse from box coordinates rather than the flattened string.
 */

/** Parse a PDF produced by the Shopee Express label generator. */
export async function parsePdfLabel(pdfPath) {
  const pages = await extractBoxes(pdfPath);
  if (!pages.length) throw new Error('PDF has no pages');
  return parseBoxes(pages.flatMap((p) => p.boxes), { source: pdfPath });
}

/**
 * Parse label text pasted from the Shopee seller centre or a label viewer.
 * Column information is gone, so only the single-column fields are recovered;
 * the interactive form fills in the rest.
 */
export function parseTextLabel(rawText) {
  const lines = String(rawText)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const boxes = lines.map((text, i) => ({
    text,
    x: 0,
    y: (lines.length - i) * 12,
    size: 9,
    width: text.length * 4.5,
    page: 1,
  }));
  return parseBoxes(boxes, { source: 'text', singleColumn: true });
}

/** Parse an already-structured label object (JSON file or form output). */
export function parseObjectLabel(obj, source = 'json') {
  const label = createLabel(obj);
  label.source = source;
  return label;
}

const TRACKING_SCAN = new RegExp(TRACKING_RE.source, 'g');
const PHONE_RE = /^(?:\+?62|0)\d[\d\s-]{7,16}$/;
const ORDER_RE = /\b(\d{8,14}[A-Z0-9]{4,})\b/;
const LABEL_REF_RE = /^[A-Z]{1,3}-?\d{2,4}$/;
const ROUTE_RE = /^([A-Z]{2,4}-[A-Z0-9]{1,4}-\d{1,3})$/i;
const SERVICE_RE = /^(ECO|REG|REG\+|ONS|KILAT|EXPRESS|SPS|COD)\b/i;
const META_RE = /^(Berat|COD\s*Cek\s*Dulu|Batas\s*Kirim|No\.?\s*Pesanan)\b/i;
const RECEIVER_HEADER = /^penerima\s*:?$/i;
const SENDER_HEADER = /^pengirim\s*:?$/i;
const TABLE_HEADERS = ['#', 'Nama Produk', 'SKU', 'Variasi', 'Qty'];

export function parseBoxes(boxes, { source = 'unknown', singleColumn = false } = {}) {
  const all = boxes.filter((b) => b.text && b.text.trim());
  const label = createLabel();

  label.trackingNumber = pickTracking(all);

  // Fields whose label and value sit in one or two boxes on the same baseline.
  label.weight = fieldValue(all, /^Berat\b[:.]?\s*(.*)$/i) || fieldValue(all, /^(\d+\s*(?:gr|kg|g)\b.*)$/i);
  label.codCheckFirst = fieldValue(all, /^COD\s*Cek\s*Dulu\s*[:.]?\s*(.*)$/i);
  label.shipBy = fieldValue(all, /^Batas\s*Kirim\s*[:.]?\s*(.*)$/i);
  label.orderNumber = fieldValue(all, /^No\.?\s*Pesanan\s*[:.]?\s*(.*)$/i) || findOrderNumber(all);
  label.service = all.find((b) => SERVICE_RE.test(b.text.trim()))?.text.trim() ?? '';
  label.routeCode = all.find((b) => ROUTE_RE.test(b.text.trim()))?.text.trim() ?? '';
  label.labelRef = all.find((b) => b.size > 12 && LABEL_REF_RE.test(b.text.trim()))?.text.trim() ?? '';

  const blocks = singleColumn ? parseSingleColumn(all) : splitPartyBlocks(all);
  label.receiver = blocks.receiver;
  label.sender = blocks.sender;
  label.items = singleColumn ? parseLineItems(all) : parseItems(all);

  label.source = source;
  return label;
}

function emptyBlocks() {
  return { receiver: { name: '', address: [], phone: '', city: '' }, sender: { name: '', address: [], phone: '', city: '' } };
}

/**
 * Parse a pasted, single-column label.
 *
 * The PDF path locates the two party columns by their x positions, which means
 * nothing when the text has been flattened. Here the "Penerima:" / "Pengirim:"
 * headers switch the active party instead, and unrecognised lines fall through
 * to the address of whoever is active.
 */
function parseSingleColumn(all) {
  const out = emptyBlocks();
  const rows = [...all].sort((a, b) => b.y - a.y); // y grows upward, so descending = reading order
  let party = null;
  let expecting = null;

  for (const box of rows) {
    const text = box.text.trim();
    if (!text || looksLikeTracking(box)) continue;

    let m;
    if ((m = text.match(/^penerima\s*:?[ \t]*(.*)$/i))) {
      party = 'receiver';
      expecting = 'name';
      if (clean(m[1])) out.receiver.name = clean(m[1]);
      continue;
    }
    if ((m = text.match(/^pengirim\s*:?[ \t]*(.*)$/i))) {
      party = 'sender';
      expecting = 'name';
      if (clean(m[1])) out.sender.name = clean(m[1]);
      continue;
    }
    if (!party) continue;
    if (META_RE.test(text) || TABLE_HEADERS.includes(text)) {
      party = null;
      expecting = null;
      continue;
    }
    if ((m = text.match(/^(?:alamat|address)\s*:?[ \t]*(.*)$/i))) {
      expecting = 'address';
      if (clean(m[1])) out[party].address.push(clean(m[1]));
      continue;
    }
    if ((m = text.match(/^(?:hp|telepon|phone|telp)\s*:?[ \t]*(.*)$/i))) {
      out[party].phone = clean(m[1]);
      expecting = null;
      continue;
    }
    if ((m = text.match(/^(?:kota|city)\s*:?[ \t]*(.*)$/i))) {
      out[party].city = clean(m[1]);
      expecting = null;
      continue;
    }
    if (expecting === 'name') {
      out[party].name = clean(text);
      expecting = null;
      continue;
    }
    out[party].address.push(clean(text));
  }

  for (const p of [out.receiver, out.sender]) {
    p.address = p.address.filter(Boolean);
    if (!p.phone) p.phone = p.address.find((a) => PHONE_RE.test(a)) ?? '';
  }
  return out;
}

function clean(v) {
  if (v == null) return '';
  return String(v).replace(/^[\s:#.]+/, '').replace(/[\s:#.]+$/, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Read the value that follows a field label. `capture` must expose the value
 * as group 1 when the label and value share a box; when it comes back empty
 * the value is looked up as the nearest box to the right on the same baseline.
 */
function fieldValue(all, capture, { maxGap = 60 } = {}) {
  const box = all.find((b) => {
    capture.lastIndex = 0;
    return capture.test(b.text.trim());
  });
  if (!box) return '';
  capture.lastIndex = 0;
  const inline = clean(box.text.trim().match(capture)?.[1]);
  if (inline) return inline;
  const end = box.x + (box.width ?? 0);
  const right = all
    .filter((b) => b !== box && Math.abs(b.y - box.y) < 1.5 && b.x >= end - 1 && b.x - end <= maxGap)
    .sort((a, b) => a.x - b.x)[0];
  return right ? clean(right.text) : '';
}

function pickTracking(all) {
  const counts = new Map();
  for (const b of all) {
    for (const m of b.text.matchAll(TRACKING_SCAN)) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
  }
  let best = null;
  for (const [token, count] of counts) {
    if (!best || count > best.count) best = { token, count };
  }
  return best?.token ?? '';
}

function findOrderNumber(all) {
  for (const b of all) {
    const m = b.text.match(ORDER_RE);
    if (m) return m[1];
  }
  const joined = all.map((b) => b.text).join(' ');
  return joined.match(ORDER_RE)?.[1] ?? '';
}

/**
 * Split the party region into receiver and sender blocks.
 *
 * The two headers anchor two columns. We stop at the metadata row (Berat /
 * Batas Kirim) and drop the vertical barcode repeats. A column line that
 * visually overflows the column boundary is re-joined with the fragment next
 * to it on the same baseline - that is how the district line
 * "KAB. KARAWANG TELUKJAMBE TIMUR | Sukaluyu" is split in the real label.
 */
function splitPartyBlocks(all) {
  const empty = emptyBlocks();
  const recH = all.find((b) => RECEIVER_HEADER.test(b.text.trim()));
  const sndH = all.find((b) => SENDER_HEADER.test(b.text.trim()));
  if (!recH || !sndH) return empty;

  const leftIsReceiver = recH.x <= sndH.x;
  const [leftH, rightH] = leftIsReceiver ? [recH, sndH] : [sndH, recH];
  const topY = Math.max(leftH.y, rightH.y);
  const metaTop = Math.max(
    ...all.filter((b) => META_RE.test(b.text.trim())).map((b) => b.y),
    -Infinity
  );

  const headers = new Set([leftH, rightH]);
  const region = all.filter(
    (b) =>
      !headers.has(b) &&
      b.y < topY + 1 &&
      b.y > Math.max(metaTop, topY - 140) &&
      !META_RE.test(b.text.trim()) &&
      !TABLE_HEADERS.includes(b.text.trim()) &&
      !looksLikeTracking(b)
  );
  if (!region.length) return empty;

  // The two party columns share baselines, so a baseline test cannot separate
  // them. The sender column does have a fixed x though: align to the "Pengirim:"
  // header, and treat the boxes on the sender's own row as the column's anchor.
  // Anything in the sender's x range that is not aligned to that anchor, and not
  // high enough to be the sender's own data, is a full-width label line that
  // belongs to the receiver - the district row "KAB. KARAWANG TELUKJAMBE TIMUR
  // | Sukaluyu" and the line "Pringgodani Bumi Telukjam" both look like sender
  // data by x alone.
  const senderX = sndH.x;
  const left = [];
  const right = [];
  for (const b of region) {
    if (b.x < senderX) {
      if (b.x + (b.width ?? 0) > senderX + 6) b.spillable = true;
      left.push(b);
    } else {
      right.push(b);
    }
  }

  const anchors = right.filter((b) => b.y > sndH.y - 20).map((b) => b.x);
  if (anchors.length) {
    for (let i = right.length - 1; i >= 0; i--) {
      const { x } = right[i];
      if (anchors.some((a) => Math.abs(a - x) < 6)) continue;
      if (right[i].y > sndH.y - 20) continue;
      left.push(right.splice(i, 1)[0]);
    }
  }

  // Re-join overflow fragments with the same-baseline piece in the other column.
  const byBaseline = new Map();
  for (const b of right) {
    const key = Math.round(b.y);
    if (!byBaseline.has(key)) byBaseline.set(key, []);
    byBaseline.get(key).push(b);
  }
  for (const b of left) {
    if (!b.spillable) continue;
    const group = byBaseline.get(Math.round(b.y));
    if (!group?.length) continue;
    b.spill = group.map((g) => g.text).join(' ');
    for (const g of group) right.splice(right.indexOf(g), 1);
  }

  const toLines = (items) => {
    // Match on box identity, not text: "TELUKJAMBE TIMUR" appears on more
    // than one line of the label.
    return groupLines(items).map((line) => {
      const owner = line.items.find((b) => b.spill);
      return owner ? `${line.text} ${owner.spill}` : line.text;
    });
  };

  const leftParty = buildParty(toLines(left));
  const rightParty = buildParty(toLines(right));
  return leftIsReceiver
    ? { receiver: leftParty, sender: rightParty }
    : { receiver: rightParty, sender: leftParty };
}

function looksLikeTracking(box) {
  const m = box.text.trim().match(TRACKING_RE);
  return !!m && m[1] === box.text.trim();
}

function buildParty(lines) {
  const out = { name: '', address: [], phone: '', city: '' };
  const rest = [];
  for (const line of lines) {
    const t = clean(line);
    if (!t) continue;
    if (!out.phone) {
      const digits = t.replace(/[\s-]/g, '');
      if (PHONE_RE.test(digits) && digits.replace(/\D/g, '').length >= 9) {
        out.phone = digits;
        continue;
      }
    }
    rest.push(t);
  }
  if (rest.length) {
    out.name = rest[0];
    out.address = rest.slice(1);
  }
  if (out.address.length > 1) {
    const last = out.address[out.address.length - 1];
    if (/^(kab|kota|kotamadya|provinsi|prov)\b\.?/i.test(last)) {
      out.city = out.address.pop();
    }
  }
  return out;
}

/**
 * Product table. The label draws it as a real table, so lean on the column
 * x positions taken from the header row; a box belongs to the first column
 * whose x it starts at or before.
 */
/**
 * Parse items from a pasted list such as "1x Cover Tutup Knalpot".
 *
 * The PDF path can rely on the printed table header and x positions; plain
 * text cannot, so the row number and quantity have to be read from the line
 * itself.
 */
function parseLineItems(all) {
  const items = [];
  for (const box of [...all].sort((a, b) => b.y - a.y)) {
    const text = clean(box.text);
    if (!text || /^Pesan\b/i.test(text) || looksLikeTracking(box)) continue;
    const m = text.match(/^(\d+)\s*(?:x|\*)\s+(.+)$/i);
    if (m) {
      items.push({ no: String(items.length + 1), name: clean(m[2]), sku: '', variation: '', qty: m[1] });
      continue;
    }
    const q = text.match(/^Qty\s*[:.]?\s*(\d+)\s*[:.]?\s*(.*)$/i);
    if (q) {
      if (!items.length) items.push({ no: '1', name: '', sku: '', variation: '', qty: q[1] });
      items[items.length - 1].qty = q[1];
      if (clean(q[2])) items[items.length - 1].name = clean(q[2]);
    }
  }
  return items.filter((i) => i.name || i.qty);
}

function parseItems(all) {
  const headerBoxes = TABLE_HEADERS.map((h) => all.find((b) => b.text.trim() === h)).filter(Boolean);
  if (headerBoxes.length < 2) return [];
  const headerY = headerBoxes[0].y;
  const cols = headerBoxes.map((b, i) => ({ key: keyFor(TABLE_HEADERS.indexOf(b.text.trim())), x: b.x }));
  const dataBottom = headerY - 1;

  const numberBoxes = all.filter((b) => /^\d+$/.test(b.text.trim()) && b.x <= cols[0].x + 4 && b.y < headerY && b.y > headerY - 90);
  if (!numberBoxes.length) return [];

  const rows = new Map();
  for (const b of all) {
    if (b.y >= headerY) continue;
    if (b.y < dataBottom - 90) continue;
    if (b.y < headerY - 90) continue;
    if (META_RE.test(b.text.trim()) || looksLikeTracking(b)) continue;
    if (/^Pesan\b/i.test(b.text.trim())) continue;
    const key = columnFor(b, cols);
    if (key === 'no') continue;
    const no = rowNumberFor(b, numberBoxes);
    if (no == null) continue;
    if (!rows.has(no)) rows.set(no, { no: String(no), name: '', sku: '', variation: '', qty: '' });
    const row = rows.get(no);
    row[key] = row[key] ? `${row[key]} ${clean(b.text)}`.trim() : clean(b.text);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v).filter((i) => i.name || i.qty);
}

/** Column = the right-most header whose x the box starts at or after. */
function columnFor(box, cols) {
  let key = null;
  for (const c of cols) {
    if (box.x >= c.x - 4) key = c.key;
  }
  return key ?? cols[0].key;
}

function keyFor(index) {
  return ['no', 'name', 'sku', 'variation', 'qty'][index] ?? null;
}

/** The row number that applies to a box: its own row, else the nearest one above. */
function rowNumberFor(box, numberBoxes) {
  const own = numberBoxes.find((n) => Math.abs(n.y - box.y) < 1.5);
  if (own) return Number(own.text.trim());
  // Continuation lines sit *below* the row number in PDF space (smaller y).
  let best = null;
  for (const n of numberBoxes) {
    if (n.y < box.y - 1) continue;
    if (!best || n.y < best.y) best = n;
  }
  return best ? Number(best.text.trim()) : null;
}
