import { COLS } from '../label/frame.mjs';
import { code128Pattern } from '../escpos/barcode.mjs';

/**
 * Build a dot-accurate reproduction of the Shopee Express label.
 *
 * Horizontal geometry (columns, box x-ranges, barcode cells) is normalised
 * against the original PDF, so it scales to any paper. Vertical layout is NOT
 * taken from the PDF aspect ratio: the original is a 100x80mm sheet printed at
 * 203dpi, which is far denser than a thermal head can resolve per line. Instead
 * we lay out on a real 24-dot line grid - the printer's own character cell - so
 * nothing overlaps, and let the label come out as long as it needs to be.
 *
 * Paper is 58mm = 384 dots or 80mm = 576 dots at 203dpi.
 */

export const LINE = 24; // font C cell height
export const FONT_A_W = 12; // font A cell width
export const FONT_C_W = 6; // font C cell width

export function buildPlan(label, { paper = 58, density = 0, qr = true, barcodeLayout = 'auto' } = {}) {
  const dots = paper === 80 ? 576 : 384;
  const plan = [];
  const ctx = { dots, plan, y: 0, density, notes: [] };
  const X = (n) => Math.round(n * dots);

  plan.push({ type: 'init' });

  // --- top: three barcodes, tracking number beneath each -------------------
  // Three 167-module symbols need 501 dots of width (62mm), so on a 58mm head
  // the same three symbols are stacked instead of squeezed side by side.
  const barH = 40;
  const topLayout = resolveBarcodeLayout(dots, label.trackingNumber, barcodeLayout);
  ctx.plan.push({ type: 'note', note: layoutNote('top', paper, topLayout) });
  if (topLayout.across) {
    for (const cx of acrossCellX(dots)) {
      barcodeInCell(ctx, label.trackingNumber, { x: cx, w: topLayout.width, h: barH });
    }
    ctx.y += barH;
    for (const cx of acrossCellX(dots)) {
      text(ctx, label.trackingNumber, { x: cx, w: topLayout.width, align: 'center' });
    }
    ctx.y += LINE;
  } else {
    for (let i = 0; i < 3; i++) {
      rect(ctx, 2, ctx.y, dots - 4, barH, 1);
      barcodeInCell(ctx, label.trackingNumber, { x: 8, y: ctx.y + 3, w: dots - 16, h: barH - 8 });
      ctx.y += barH + 2;
    }
  }

  // --- service -------------------------------------------------------------
  text(ctx, label.service ?? '', { x: 0, w: dots, align: 'center', font: 'A', scale: 2 });
  ctx.y += LINE * 2;

  // --- label reference -----------------------------------------------------
  text(ctx, label.labelRef ?? '', { x: X(COLS.labelRef), font: 'A', scale: 2 });
  ctx.y += LINE * 2;

  // --- route code box + resi box, side by side -----------------------------
  const routeX = Math.round(0.29 * dots);
  const routeW = Math.round(0.34 * dots);
  const resiX = Math.round(0.64 * dots);
  const resiW = dots - resiX - 6;
  const boxH = LINE + 8;
  rect(ctx, routeX, ctx.y, routeW, boxH, 1);
  rect(ctx, resiX, ctx.y, resiW, boxH, 1);
  text(ctx, label.routeCode ?? '', { x: routeX + 4, w: routeW - 8, align: 'center', bold: true });
  text(ctx, label.trackingNumber, { x: resiX + 4, w: resiW - 8, align: 'center', bold: true });
  ctx.y += boxH;

  // --- receiver box, with the sender column to its right --------------------
  const recvX = Math.round(0.02 * dots);
  const recvW = Math.round(0.27 * dots);
  const senderX = Math.round(0.604 * dots); // "Pengirim:" label column
  const senderValueX = Math.round(0.73 * dots); // sender values sit further right
  const senderW = dots - senderValueX - 4;

  const partiesY = ctx.y;
  text(ctx, 'Penerima:', { x: recvX + 3 });
  text(ctx, label.receiver?.name ?? '', { x: recvX + 3 + 8 * FONT_C_W, bold: true });
  text(ctx, 'Pengirim:', { x: senderX });
  text(ctx, label.sender?.name ?? '', { x: senderValueX, bold: true });
  ctx.y += LINE;

  // The source label stores the address as pre-broken lines, so we print each
  // one as-is rather than re-wrapping - that is what the real label looks like.
  const addr = addressLines(label.receiver);
  addr.forEach((line, i) => {
    text(ctx, line, { x: recvX + 3 });
    if (i === 0) text(ctx, label.sender?.phone ?? '', { x: senderValueX });
    ctx.y += LINE;
  });
  // The sender's own address starts one row below its phone number.
  addressLines(label.sender).forEach((line, i) => {
    text(ctx, line, { x: senderValueX, y: partiesY + LINE * (2 + i) });
  });
  if (label.receiver?.postalCode) {
    text(ctx, label.receiver.postalCode, { x: recvX + 3, w: recvInner, bold: true });
    ctx.y += LINE;
  }
  const recvH = ctx.y - partiesY;
  rect(ctx, recvX, partiesY, recvW, recvH, 1);

  // --- weight / COD --------------------------------------------------------
  const wY = ctx.y;
  const wW = Math.round(0.16 * dots);
  rect(ctx, recvX, wY, wW, LINE + 6, 1);
  text(ctx, 'Berat:', { x: recvX + 3, bold: true });
  text(ctx, label.weight ?? '', { x: recvX + 3 + 6 * FONT_C_W, bold: true });
  text(ctx, 'COD Cek Dulu:', { x: Math.round(0.46 * dots), bold: true });
  // The stock label always prints this field, so an absent value means "no".
  const cod = String(label.codCheckFirst ?? '').trim() || 'TIDAK';
  text(ctx, cod, { x: Math.round(0.46 * dots) + 12 * FONT_C_W, bold: true });
  ctx.y += LINE + 6;

  // --- ship-by -------------------------------------------------------------
  const sY = ctx.y;
  const sW = Math.round(0.3 * dots);
  rect(ctx, recvX, sY, sW, LINE + 6, 1);
  text(ctx, `Batas Kirim: ${label.shipBy ?? ''}`, { x: recvX + 3, w: sW - 6 });
  ctx.y += LINE + 6;

  text(ctx, `No.Pesanan: ${label.orderNumber ?? ''}`, { x: recvX + 3 });
  ctx.y += LINE + 8;

  // --- product table -------------------------------------------------------
  const hx = [COLS.tableHash, COLS.tableName, COLS.tableSku, COLS.tableVariation, COLS.tableQty].map((n) => X(n));
  ['#', 'Nama Produk', 'SKU', 'Variasi', 'Qty'].forEach((h, i) => {
    text(ctx, h, { x: hx[i], bold: true });
  });
  const ruleY = ctx.y + LINE;
  rule(ctx, { x: 0, y: ruleY, w: dots, thickness: 2 });
  ctx.y = ruleY + 3;

  for (const [i, item] of (label.items ?? []).entries()) {
    const nameW = hx[2] - hx[1] - 6;
    const varW = hx[4] - hx[3] - 6;
    const nameLines = wrap(item.name ?? '', nameW);
    const varLines = [item.variation, ...(item.extra ?? [])].filter(Boolean).flatMap((v) => wrap(v, varW));
    const rows = Math.max(nameLines.length, varLines.length, 1);
    const rowY = ctx.y;
    text(ctx, String(i + 1), { x: hx[0], y: rowY });
    nameLines.forEach((l, k) => text(ctx, l, { x: hx[1], y: rowY + k * LINE, w: nameW }));
    varLines.forEach((l, k) => text(ctx, l, { x: hx[3], y: rowY + k * LINE, w: varW }));
    if (item.sku) text(ctx, item.sku, { x: hx[2], y: rowY, w: varW });
    text(ctx, String(item.qty ?? 1), { x: hx[4], y: rowY });
    ctx.y = rowY + rows * LINE + 2;
  }

  // --- order caption -------------------------------------------------------
  text(ctx, `Pesan: (${label.orderNumber}) (${label.trackingNumber})`, { x: 2 });
  ctx.y += LINE;

  // --- bottom barcode row --------------------------------------------------
  ctx.y += emitBottomBarcodes(ctx, label, { dots, paper, barcodeLayout });

  if (qr && label.qr) {
    const size = Math.round(dots * 0.22);
    const cy = Math.round(ctx.y + ctx.dots * 0.02);
    qrAt(ctx, label.qr, { x: Math.round(dots * 0.06), y: cy, size });
    ctx.y = cy + size + 6;
  }

  plan.push({ type: 'note', note: `label height ${ctx.y} dots (${(ctx.y / 8).toFixed(0)}mm)` });
  plan.push({ type: 'cut', feed: 60 });
  return plan;
}

// ---------------------------------------------------------------------------

function text(ctx, str, opts = {}) {
  if (!str) return;
  const { x = 0, w = 0, align = 'left', bold = false, font = 'C', scale = 1 } = opts;
  const y = opts.y ?? ctx.y;
  const charW = (font === 'A' ? FONT_A_W : FONT_C_W) * scale;
  let startX = x;
  if (w) {
    const run = str.length * charW;
    if (align === 'center') startX = x + Math.round((w - run) / 2);
    else if (align === 'right') startX = x + w - run;
  }
  const height = LINE * scale * (font === 'A' ? 1 : 1);
  ctx.plan.push({
    type: 'text',
    text: String(str),
    x: Math.max(0, Math.round(startX)),
    y: Math.max(0, Math.round(y)),
    font,
    scale,
    bold,
    height,
  });
}

function rule(ctx, { x, y, w, thickness = 1 }) {
  ctx.plan.push({ type: 'rule', x: Math.round(x), y: Math.round(y), w: Math.round(w), thickness });
}

function rect(ctx, x, y, w, h, thickness = 1) {
  ctx.plan.push({
    type: 'rect',
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    thickness,
  });
}

/** Fit a CODE128 symbol inside a cell, never exceeding the available width. */
function barcodeInCell(ctx, data, { x, y, w, h }) {
  if (!data) return;
  const { modules } = code128Pattern(data);
  const width = Math.max(8, w);
  let moduleWidth = Math.max(1, Math.floor(width / modules));
  if (moduleWidth > 6) moduleWidth = 6;
  ctx.plan.push({
    type: 'barcode',
    data,
    x: Math.round(x),
    y: Math.round(y ?? ctx.y),
    w: width,
    h: Math.max(8, Math.round(h)),
    moduleWidth,
  });
}

function qrAt(ctx, data, { x, y, size }) {
  ctx.plan.push({ type: 'qr', data, x, y, size });
}

/**
 * Decide whether the three repeated tracking-number symbols go side by side.
 *
 * Three 167-module symbols need 501 dots even at a 1-dot module - 62mm of print
 * width, which is wider than a 58mm head. When they do not fit we stack them
 * instead of squeezing them to an unscannable width, and an explicit "across"
 * request degrades to stacked rather than running off the paper.
 */
const BARCODE_MARGIN = 8;
const BARCODE_GAP = 8;

/** Dots available to one of the three repeated symbols when placed side by side. */
function acrossSymbolWidth(dots) {
  return Math.floor((dots - 2 * BARCODE_MARGIN - 2 * BARCODE_GAP) / 3);
}

/**
 * Left edges of the three cells. Derived from the margin, width and gap rather
 * than taken from the source sheet's fractions, so they tile the print head
 * exactly at any paper width instead of overflowing at 80mm.
 */
function acrossCellX(dots) {
  const w = acrossSymbolWidth(dots);
  return [0, 1, 2].map((i) => BARCODE_MARGIN + i * (w + BARCODE_GAP));
}

function resolveBarcodeLayout(dots, data, requested) {
  if (!data) return { across: false, fits: false, width: 0 };
  const { modules } = code128Pattern(data);
  const width = acrossSymbolWidth(dots);
  const fits = modules <= width;
  if (requested === 'stack') return { across: false, fits, width };
  if (requested === 'across' && !fits) return { across: false, fits, width, forced: true };
  return { across: requested === 'across' || fits, fits, width };
}

function layoutNote(where, mm, { across, forced }) {
  if (across) return `${where} barcodes: three across`;
  if (forced) return `${where} barcodes: across requested but will not fit ${mm}mm - stacked instead`;
  return `${where} barcodes: stacked (${mm}mm cannot fit three across)`;
}

function emitBottomBarcodes(ctx, label, { dots, paper, barcodeLayout }) {
  const data = label.trackingNumber;
  if (!data) return 0;
  const layout = resolveBarcodeLayout(dots, data, barcodeLayout);
  ctx.plan.push({ type: 'note', note: layoutNote('bottom', paper, layout) });

  if (layout.across) {
    const cellW = layout.width;
    const h = 46;
    for (const x of acrossCellX(dots)) {
      rect(ctx, x, ctx.y, cellW, h, 1);
      barcodeInCell(ctx, data, { x: x + 3, y: ctx.y + 3, w: cellW - 6, h: h - 26 });
      text(ctx, data, { x, y: ctx.y + h - 22, w: cellW, align: 'center' });
    }
    return h + 4;
  }

  const h = 40;
  for (let i = 0; i < 3; i++) {
    rect(ctx, 2, ctx.y, dots - 4, h, 1);
    barcodeInCell(ctx, data, { x: 8, y: ctx.y + 3, w: dots - 16, h: h - 8 });
    ctx.y += h + 2;
  }
  return 4;
}

function addressLines(party) {
  if (!party) return [];
  const out = [];
  for (const a of party.address ?? []) if (a) out.push(String(a));
  const last = (party.address ?? []).at(-1);
  if (party.city && party.city !== last) out.push(String(party.city));
  return out;
}

/** Greedy wrap against a dot budget. */
function wrap(str, dots) {
  const perLine = Math.max(4, Math.floor(dots / FONT_C_W));
  const words = String(str).split(/\s+/).filter(Boolean);
  const out = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > perLine) {
      out.push(line);
      line = w;
    } else {
      line = line ? line + ' ' + w : w;
    }
  }
  if (line) out.push(line);
  return out;
}
