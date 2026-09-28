import EscPosBuilder from '../escpos/builder.mjs';
import { code128Pattern } from '../escpos/barcode.mjs';
import { encodeQR, matrixToRaster } from '../escpos/qr.mjs';

/**
 * Render the dot plan from src/render/plan.mjs into ESC/POS bytes.
 *
 * The label is composed as a 1-bit-per-dot page so box rules, barcode modules
 * and the QR all merge into one crisp image at exact coordinates. Text stays
 * real printer text (so it uses the built-in font and scans cleanly) and is
 * stamped into a fixed line grid:
 *
 *     |<-- ART_ART dots -->|<------ TEXT dots ------>|
 *     one 36-dot band per printed line
 *
 * A GS v 0 raster band advances the paper by its own height, so emitting
 * ART_ART dots of art followed by a 24-dot text cell lands the glyphs exactly
 * where the plan asked for them.
 */

const ART_DOTS = 12; // dots of raster art at the top of each band
const TEXT_DOTS = 24; // the printer's standard line cell (font C is 6x24)
const BAND = ART_DOTS + TEXT_DOTS;

/** Height in dots the label actually occupies, from the bottom of its art. */
export function planHeight(plan, dots) {
  const probe = new Page(dots, 4096);
  for (const op of plan) applyArt(probe, op, dots);
  return probe.inkBottom();
}

export function planToEscPos(plan, { dots, codePage = 0, cut = 'partial' } = {}) {
  const b = new EscPosBuilder();
  const texts = new Map(); // line index -> [text ops]
  let feed = 60;

  // First pass: lay the art out on a page so we know how tall the label is.
  const probe = new Page(dots, 4096);
  for (const op of plan) applyArt(probe, op, dots);
  const height = probe.inkBottom();
  const page = new Page(dots, height);
  for (const op of plan) applyArt(page, op, dots);

  for (const op of plan) {
    if (op.type !== 'text') continue;
    const line = lineOf(op.y, op.height ?? TEXT_DOTS);
    if (!texts.has(line)) texts.set(line, []);
    texts.get(line).push(op);
  }

  b.init();
  b.setDots(3);
  b.codePage(codePage);
  b.selectFont(2); // font C (6x24)
  b.lineSpacing(TEXT_DOTS);
  b.resetStyle();

  const lines = Math.ceil(height / TEXT_DOTS);
  for (let i = 0; i < lines; i++) {
    const rowTexts = texts.get(i);
    if (!rowTexts || rowTexts.length === 0) {
      // No glyphs on this line, so paint the art and feed the paper through.
      b.absX(0);
      b.raster(page.slice(i * TEXT_DOTS, TEXT_DOTS), 0);
      b.absDots(0);
      continue;
    }
    const art = page.slice(i * TEXT_DOTS, ART_DOTS);
    const hasArt = art.data.some((v) => v);
    if (hasArt) {
      b.absX(0);
      b.raster(art, 0);
    }
    for (const t of rowTexts) {
      b.absX(t.x);
      applyStyle(b, t);
      b.text(t.text);
    }
    // Printing the buffer also advances the paper by one line, so the next
    // iteration lands exactly one line lower.
    b.feedLines(1);
  }

  b.resetStyle();
  b.cut(cut === 'none' ? 'partial' : cut, feed);
  return b.build();
}

/** Line index for a y offset, given a glyph cell height. */
function lineOf(y, cell) {
  return Math.max(0, Math.round(y / TEXT_DOTS));
}

function applyStyle(b, t) {
  if (t.font === 'A') b.selectFont(0);
  else b.selectFont(2);
  b.size(t.scale ?? 1, t.scale ?? 1);
  b.bold(!!t.bold);
}

function applyArt(page, op, dots) {
  switch (op.type) {
    case 'init':
    case 'note':
    case 'text':
    case 'cut':
      break;
    case 'rule':
      page.hLine(op.x, op.y, op.w, op.thickness ?? 1);
      break;
    case 'rect':
      page.rect(op.x, op.y, op.w, op.h, op.thickness ?? 1);
      break;
    case 'barcode':
      page.blit(barcodeBitmap(op), op.x, op.y);
      break;
    case 'qr':
      page.blit(qrRaster(op), op.x, op.y);
      break;
    default:
      break;
  }
  void dots;
}

/** CODE128 symbol rendered as a bitmap at an exact width and height. */
function barcodeBitmap(op) {
  const { modules, elements, quiet } = code128Pattern(op.data);
  const width = Math.max(1, modules * op.moduleWidth);
  const bitmap = { width, height: Math.max(1, op.h), data: new Uint8Array(width * Math.max(1, op.h)) };
  let x = quiet * op.moduleWidth;
  for (const [run, isBar] of elements) {
    if (isBar) {
      const w = run * op.moduleWidth;
      for (let y = 0; y < bitmap.height; y++) {
        const row = y * width;
        for (let dx = 0; dx < w; dx++) {
          const px = x + dx;
          if (px < width) bitmap.data[row + px] = 1;
        }
      }
    }
    x += run * op.moduleWidth;
  }
  return bitmap;
}

function qrRaster(op) {
  const { matrix } = encodeQR(op.data, { ecLevel: 'M' });
  const n = matrix.length;
  const scale = Math.max(1, Math.floor(op.size / n));
  return matrixToRaster(matrix, { scale });
}

/** A 1-bit-per-dot page buffer. */
class Page {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height);
  }

  set(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data[y * this.width + x] = 1;
  }

  hLine(x, y, w, t = 1) {
    for (let dy = 0; dy < t; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy);
  }

  vLine(x, y, h, t = 1) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < t; dx++) this.set(x + dx, y + dy);
  }

  rect(x, y, w, h, t = 1) {
    this.hLine(x, y, w, t);
    this.hLine(x, y + h - t, w, t);
    this.vLine(x, y, h, t);
    this.vLine(x + w - t, y, h, t);
  }

  /** Lowest row that actually has ink, used to size the label. */
  inkBottom() {
    for (let y = this.height - 1; y >= 0; y--) {
      if (this.rowHasInk(y)) return y + 1;
    }
    return TEXT_DOTS;
  }

  rowHasInk(y) {
    const at = y * this.width;
    for (let x = 0; x < this.width; x++) if (this.data[at + x]) return true;
    return false;
  }

  slice(y0, h) {
    const out = new Uint8Array(this.width * h);
    for (let y = 0; y < h; y++) {
      const sy = y0 + y;
      if (sy < 0 || sy >= this.height) continue;
      const src = sy * this.width;
      const dst = y * this.width;
      for (let x = 0; x < this.width; x++) out[dst + x] = this.data[src + x];
    }
    return { width: this.width, height: h, data: out };
  }

  blit(image, x0, y0) {
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (image.data[y * image.width + x]) this.set(x0 + x, y0 + y);
      }
    }
  }
}

export { ART_DOTS, TEXT_DOTS, BAND, Page };
