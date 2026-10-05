import { code128Pattern } from '../escpos/barcode.mjs';
import { encodeQR } from '../escpos/qr.mjs';
import { FONT_A_W, FONT_C_W, LINE } from './plan.mjs';

const TEXT_DOTS = LINE;

/**
 * Render a dot plan as ASCII art so the layout can be checked in the terminal
 * before burning paper.
 *
 * The default width is 64 columns, which maps 1:1 onto font C's 6-dot character
 * cell, so the preview is the printed grid rather than an approximation of it.
 */
export function planToAscii(plan, { dots, cols = 64, showText = true } = {}) {
  const width = Math.max(1, Math.min(160, cols));
  const px = dots / width; // dots per character cell

  // Compose the art exactly the way the ESC/POS backend does.
  const probe = makeCanvas(dots, 4096);
  for (const op of plan) applyArt(probe, op, dots);
  const height = probe.inkBottom();

  const rows = Math.max(4, Math.ceil(height / px / 2)); // 2 dots per text row
  const grid = Array.from({ length: rows }, () => Array(width).fill(' '));

  const put = (x, y) => {
    if (x < 0 || y < 0 || y >= height) return;
    const cx = Math.floor(x / px);
    const cy = Math.floor(y / px / 2);
    if (cx < 0 || cx >= width) return;
    if (cy < 0 || cy >= rows) return;
    grid[cy][cx] = '#';
  };
  const hLine = (x, y, len, t = 1) => {
    for (let dy = 0; dy < t; dy++) for (let dx = 0; dx < len; dx++) put(x + dx, y + dy);
  };
  const vLine = (x, y, len, t = 1) => {
    for (let dy = 0; dy < len; dy++) for (let dx = 0; dx < t; dx++) put(x + dx, y + dy);
  };
  const blit = (image, x0, y0) => {
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (image.data[y * image.width + x]) put(x0 + x, y0 + y);
      }
    }
  };

  for (const op of plan) {
    switch (op.type) {
      case 'rule':
        hLine(op.x, op.y, op.w, op.thickness ?? 1);
        break;
      case 'cutLine': {
        const dash = op.dash ?? 12;
        const gap = op.gap ?? 6;
        let cur = op.x;
        while (cur < op.x + op.w) {
          const seg = Math.min(dash, op.x + op.w - cur);
          for (let dy = 0; dy < (op.thickness ?? 2); dy++) {
            for (let dx = 0; dx < seg; dx++) {
              const cx = Math.floor((cur + dx) / px);
              const cy = Math.floor((op.y + dy) / px / 2);
              if (cx >= 0 && cx < width && cy >= 0 && cy < rows) {
                grid[cy][cx] = '-';
              }
            }
          }
          cur += dash + gap;
        }
        break;
      }
      case 'rect':
        rectInto(hLine, vLine, op);
        break;
      case 'barcode': {
        const { elements, quiet } = code128Pattern(op.data);
        let x = quiet * op.moduleWidth;
        for (const [run, isBar] of elements) {
          if (isBar) {
            const bw = run * op.moduleWidth;
            for (let y = 0; y < op.h; y++) for (let dx = 0; dx < bw; dx++) put(op.x + x + dx, op.y + y);
          }
          x += run * op.moduleWidth;
        }
        break;
      }
      case 'qr': {
        const { matrix } = encodeQR(op.data, { ecLevel: 'M' });
        const n = matrix.length;
        const qs = Math.max(1, Math.floor(op.size / n));
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            if (!matrix[y][x]) continue;
            for (let dy = 0; dy < qs; dy++) {
              for (let dx = 0; dx < qs; dx++) put(op.x + x * qs + dx, op.y + y * qs + dy);
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }

  // Stamp text on top, keeping true relative character spacing.
  if (showText) {
    for (const op of plan) {
      if (op.type !== 'text') continue;
      const cy = Math.floor(op.y / px / 2);
      if (cy < 0 || cy >= rows) continue;
      const charDots = (op.font === 'A' ? FONT_A_W : FONT_C_W) * (op.scale ?? 1);
      for (let k = 0; k < op.text.length; k++) {
        const c = op.text[k];
        if (c === ' ') continue;
        const cx = Math.floor((op.x + k * charDots) / px);
        if (cx < 0 || cx >= width) continue;
        grid[cy][cx] = c;
      }
    }
  }

  return grid.map((r) => r.join('').replace(/\s+$/, '')).join('\n');
}

function rectInto(hLine, vLine, op) {
  const t = op.thickness ?? 1;
  hLine(op.x, op.y, op.w, t);
  hLine(op.x, op.y + op.h - t, op.w, t);
  vLine(op.x, op.y, op.h, t);
  vLine(op.x + op.w - t, op.y, op.h, t);
}

/** Human-readable notes the planner attached while laying the label out. */
export function planNotes(plan) {
  return plan.filter((op) => op.type === 'note').map((op) => op.note);
}

// A minimal art-only mirror of the ESC/POS backend's page buffer.
function makeCanvas(width, height) {
  const data = new Uint8Array(width * height);
  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    data[y * width + x] = 1;
  };
  return {
    width,
    height,
    data,
    set,
    hLine: (x, y, len, t = 1) => {
      for (let dy = 0; dy < t; dy++) for (let dx = 0; dx < len; dx++) set(x + dx, y + dy);
    },
    dashedHLine: (x, y, len, t = 1, dash = 12, gap = 6) => {
      let cur = x;
      while (cur < x + len) {
        const seg = Math.min(dash, x + len - cur);
        for (let dy = 0; dy < t; dy++) for (let dx = 0; dx < seg; dx++) set(cur + dx, y + dy);
        cur += dash + gap;
      }
    },
    vLine: (x, y, len, t = 1) => {
      for (let dy = 0; dy < len; dy++) for (let dx = 0; dx < t; dx++) set(x + dx, y + dy);
    },
    rect(x, y, w, h, t = 1) {
      this.hLine(x, y, w, t);
      this.hLine(x, y + h - t, w, t);
      this.vLine(x, y, h, t);
      this.vLine(x + w - t, y, h, t);
    },
    blit(image, x0, y0) {
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          if (image.data[y * image.width + x]) set(x0 + x, y0 + y);
        }
      }
    },
    rowHasInk(y) {
      const at = y * width;
      for (let x = 0; x < width; x++) if (data[at + x]) return true;
      return false;
    },
    inkBottom() {
      for (let y = height - 1; y >= 0; y--) if (this.rowHasInk(y)) return y + 1;
      return TEXT_DOTS;
    },
  };
}

function applyArt(canvas, op) {
  switch (op.type) {
    case 'rule':
      canvas.hLine(op.x, op.y, op.w, op.thickness ?? 1);
      break;
    case 'cutLine':
      canvas.dashedHLine(op.x, op.y, op.w, op.thickness ?? 2, op.dash ?? 12, op.gap ?? 6);
      break;
    case 'rect':
      canvas.rect(op.x, op.y, op.w, op.h, op.thickness ?? 1);
      break;
    case 'barcode':
      canvas.blit(barcodeBitmap(op), op.x, op.y);
      break;
    case 'qr': {
      const { matrix } = encodeQR(op.data, { ecLevel: 'M' });
      const n = matrix.length;
      const qs = Math.max(1, Math.floor(op.size / n));
      const img = { width: n * qs, height: n * qs, data: new Uint8Array(n * qs * n * qs) };
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (!matrix[y][x]) continue;
          for (let dy = 0; dy < qs; dy++) {
            for (let dx = 0; dx < qs; dx++) img.data[(y * qs + dy) * img.width + (x * qs + dx)] = 1;
          }
        }
      }
      canvas.blit(img, op.x, op.y);
      break;
    }
    default:
      break;
  }
}

function barcodeBitmap(op) {
  const { modules, elements, quiet } = code128Pattern(op.data);
  const width = Math.max(1, modules * op.moduleWidth);
  const height = Math.max(1, op.h);
  const data = new Uint8Array(width * height);
  let x = quiet * op.moduleWidth;
  for (const [run, isBar] of elements) {
    if (isBar) {
      const w = run * op.moduleWidth;
      for (let y = 0; y < height; y++) {
        for (let dx = 0; dx < w; dx++) {
          const px = x + dx;
          if (px < width) data[y * width + px] = 1;
        }
      }
    }
    x += run * op.moduleWidth;
  }
  return { width, height, data };
}
