export const ESC = 0x1b;
export const GS = 0x1d;
export const FS = 0x1c;

/**
 * Low level ESC/POS byte assembler. Every method appends to an internal
 * buffer so a whole label becomes one single Uint8Array at the end.
 */
export class EscPosBuilder {
  constructor() {
    this._chunks = [];
    this._len = 0;
  }

  get length() {
    return this._len;
  }

  _push(bytes) {
    this._chunks.push(bytes);
    this._len += bytes.length;
    return this;
  }

  raw(bytes) {
    return this._push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  }

  /** Terminal sends and printers mostly share the same encoding. */
  text(str) {
    return this.raw(encodeText(str));
  }

  build() {
    const out = new Uint8Array(this._len);
    let at = 0;
    for (const c of this._chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }

  // ---- lifecycle -------------------------------------------------------

  /** ESC @ - reset to power-on state. */
  init() {
    return this.raw([ESC, 0x40]);
  }

  /** ESC p - open/close cash drawer kick (useful to wake a sleepy printer). */
  drawer(m = 0, t = 24) {
    return this.raw([ESC, 0x70, m, 0, t]);
  }

  /** GS V / GS v - cut paper. */
  cut(mode = 'partial', feedDots = 0) {
    if (mode === 'full') {
      this._push([GS, 0x56, 0x00]);
    } else {
      this._push([GS, 0x56, 0x01]);
      this._push([ESC, 0x42, 0x03, 0x00]);
    }
    if (feedDots > 0) this.feedDots(feedDots);
    if (mode === 'none') this._chunks.pop?.();
    return this;
  }

  // ---- paper / layout --------------------------------------------------

  /** ESC a n - 0 left, 1 center, 2 right. */
  align(a = 'left') {
    const map = { left: 0, center: 1, right: 2 };
    return this.raw([ESC, 0x61, map[a] ?? 0]);
  }

  /** ESC 3 n - line spacing in 1/180 inch. */
  lineSpacing(n = 24) {
    return this.raw([ESC, 0x33, n]);
  }

  /** ESC 2 - default line spacing. */
  lineSpacingDefault() {
    return this.raw([ESC, 0x32]);
  }

  /** ESC d n - print and feed n lines. */
  feedLines(n = 1) {
    return this.raw([ESC, 0x64, n]);
  }

  /** ESC J n - print and feed n dots. */
  feedDots(n = 0) {
    return this.raw([ESC, 0x4a, Math.max(0, Math.min(255, n))]);
  }

  /** GS L n - set left margin in printer units. */
  leftMargin(dots = 0) {
    return this.raw([GS, 0x4c, Math.max(0, Math.min(255, dots))]);
  }

  /** ESC p m t1 t2 - set horizontal/vertical motion units (not often needed). */
  setDots(dots = 3) {
    return this.raw([ESC, 0x70, 0x00, dots, 3]);
  }

  /** ESC $ nL nH - set the absolute horizontal print position, in dots. */
  absX(dots = 0) {
    const v = Math.max(0, Math.min(65535, Math.round(dots)));
    return this.raw([ESC, 0x24, v & 0xff, (v >> 8) & 0xff]);
  }

  /** ESC d n - feed n dots without printing (0..255). */
  absY(dots = 0) {
    return this.raw([ESC, 0x64, Math.max(0, Math.min(255, Math.round(dots)))]);
  }

  /**
   * Move the print head to an absolute (x, y) dot position relative to the
   * line origin. y is clamped to a single ESC d command (0..255 dots); callers
   * that need more should emit an explicit raster gap instead.
   */
  position(x, y) {
    if (x) this.absX(x);
    if (y) this.absY(y);
    return this;
  }

  // ---- text attributes -------------------------------------------------

  /** ESC E n - bold. */
  bold(on = true) {
    return this.raw([ESC, 0x45, on ? 1 : 0]);
  }

  /** ESC - n - underline. */
  underline(on = true) {
    return this.raw([ESC, 0x2d, on ? 1 : 0]);
  }

  /** ESC M n - 0 normal, 1 emphasized (double strike). */
  emphasis(on = true) {
    return this.raw([ESC, 0x4d, on ? 1 : 0]);
  }

  /**
   * GS ! n - character size. Width/height are multipliers 1..8 applied to
   * font A (12x24 at 203dpi).
   */
  size(width = 1, height = 1) {
    const w = Math.max(1, Math.min(8, Math.round(width))) - 1;
    const h = Math.max(1, Math.min(8, Math.round(height))) - 1;
    return this.raw([GS, 0x21, (h << 4) | w]);
  }

  /** ESC ! n - bit modes (font B + emphasis + double strike + underline). */
  font(a = true) {
    return this.raw([ESC, 0x21, a ? 0x00 : 0x01]);
  }

  /**
   * ESC M n - select a built-in font. At 203dpi on a 58mm head:
   *   0 = font A 12x24, 1 = font B 9x24, 2 = font C 6x24, 3 = font D 8x24.
   * Font C is what lets a 58mm roll carry the ~64 columns a Shopee label
   * layout is designed for.
   */
  selectFont(n = 0) {
    return this.raw([ESC, 0x4d, n]);
  }

  /**
   * Feed n dots WITHOUT printing. ESC J and ESC d both print the buffer before
   * feeding, which is only equivalent when the buffer is already empty - so use
   * GS ( L style relative motion where available, otherwise a bare LF sequence.
   */
  absDots(n) {
    if (n <= 0) return this;
    return this.raw([ESC, 0x4a, Math.max(0, Math.min(255, Math.round(n)))]);
  }

  /** ESC Q n - select/cancel print area margins. n > 3 clears them. */
  clearMargins() {
    return this.raw([ESC, 0x51, 0x03]);
  }

  /** ESC R n - international character set (for the built-in tables). */
  international(n = 0) {
    return this.raw([ESC, 0x52, n]);
  }

  /** ESC t n - select character code table. */
  codePage(n = 0) {
    return this.raw([ESC, 0x74, n]);
  }

  /** ESC T n - select print direction: 0 normal, 1 upside down. */
  upsideDown(on = true) {
    return this.raw([ESC, 0x54, on ? 1 : 0]);
  }

  // ---- status ----------------------------------------------------------

  /** GS v n - real time status request. 1=paper, 2=drawer, 4=status. */
  requestStatus(n = 1) {
    return this.raw([GS, 0x76, n]);
  }

  // ---- reset style -----------------------------------------------------

  resetStyle() {
    return this.bold(false).underline(false).emphasis(false).size(1, 1).align('left');
  }

  // ---- raster graphics -------------------------------------------------

  /**
   * GS v 0 m xL xH yL yH data - 1-bit raster. `image` must expose
   * { width, height, data } with data being 1 byte per pixel, 0 or 1.
   * Only 0x00 (normal density) and 0x01 (double width) are used here.
   */
  raster(image, density = 0) {
    const bytes = packRaster(image);
    const widthBytes = Math.ceil(image.width / 8);
    const xL = widthBytes & 0xff;
    const xH = (widthBytes >> 8) & 0xff;
    const yL = image.height & 0xff;
    const yH = (image.height >> 8) & 0xff;
    this._push([GS, 0x76, 0x30, density, xL, xH, yL, yH]);
    this.raw(bytes);
    return this;
  }
}

function packRaster(image) {
  const widthBytes = Math.ceil(image.width / 8);
  const out = new Uint8Array(widthBytes * image.height);
  const src = image.data;
  for (let y = 0; y < image.height; y++) {
    const rowAt = y * widthBytes;
    for (let x = 0; x < image.width; x++) {
      if (src[y * image.width + x]) {
        out[rowAt + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

const encoder = new TextEncoder();

/** UTF-8 for characters the printer can render, latin1 fallback for the rest. */
export function encodeText(str) {
  return encoder.encode(str);
}

export default EscPosBuilder;
