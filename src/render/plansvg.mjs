import { code128Pattern } from '../escpos/barcode.mjs';
import { encodeQR } from '../escpos/qr.mjs';
import { planHeight } from './planescpos.mjs';

/**
 * Render a print plan as SVG, in printer dots (1 user unit = 1 dot).
 *
 * This draws the same op list the ESC/POS backend walks, so what the browser
 * shows is the same geometry the printer receives - not a re-layout. Text is
 * pinned with textLength so the preview keeps the printer's fixed-pitch columns
 * no matter which font the browser happens to have.
 */

const CHAR_W = { A: 12, B: 12, C: 6 };
const LINE = 24;
const MONO = "'DejaVu Sans Mono','Menlo','Consolas',monospace";

const escape = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** One SVG <rect> per run; keeps the file small even for dense barcodes. */
function barcodeMarkup(op) {
  const { elements, modules } = code128Pattern(op.data);
  const moduleWidth = Math.max(1, Math.min(6, op.moduleWidth || 1));
  const total = modules * moduleWidth;
  // Centre the symbol in the cell it was given, and never draw past it.
  const w = Math.min(total, Math.max(total, op.w || total));
  const x0 = op.x + Math.max(0, ((op.w || w) - w) / 2);

  let d = '';
  let cursor = 0;
  for (const [run, isBar] of elements) {
    if (isBar) {
      const rx = x0 + cursor * moduleWidth;
      const rw = run * moduleWidth;
      d += `M${rx} ${op.y}h${rw}v${op.h}h${-rw}z`;
    }
    cursor += run;
  }
  return `<path d="${d}" fill="currentColor"/>`;
}

function qrMarkup(op) {
  let matrix;
  try {
    matrix = encodeQR(op.data, { ecLevel: 'M' }).matrix;
  } catch {
    return '';
  }
  const n = matrix.length;
  // The plan's size is the module count including the quiet zone; scale to fit.
  const unit = (op.size || n) / n;
  let d = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix[y][x]) d += `M${op.x + x * unit} ${op.y + y * unit}h${unit}v${unit}h${-unit}z`;
    }
  }
  return `<path d="${d}" fill="currentColor"/>`;
}

function textMarkup(op) {
  const str = String(op.text ?? '');
  if (!str) return '';
  const charW = (CHAR_W[op.font] ?? 6) * (op.scale ?? 1);
  const advance = str.length * charW;
  const cell = op.w || advance;

  const x =
    op.align === 'center'
      ? op.x + (cell - advance) / 2
      : op.align === 'right'
        ? op.x + cell - advance
        : op.x;
  // A monospace glyph sits low in its em box; lift it to the top of the cell so
  // the baseline lands where the printer's text buffer starts.
  const baseline = op.y + LINE * (op.scale ?? 1) * 0.8;

  const size = LINE * (op.scale ?? 1) * (op.font === 'A' ? 1.05 : 0.9);
  return (
    `<text x="${x}" y="${baseline}" font-family="${MONO}" font-size="${size}"` +
    ` textLength="${advance}" lengthAdjust="spacingAndGlyphs"` +
    `${op.bold ? ' font-weight="700"' : ''}` +
    ` xml:space="preserve">${escape(str)}</text>`
  );
}

/** The plan as a standalone, scalable SVG string. */
export function planToSvg(plan, { dots, paper = 58, title = '' } = {}) {
  const height = planHeight(plan, dots);
  const parts = [];

  for (const op of plan) {
    switch (op.type) {
      case 'rule':
        parts.push(
          `<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.thickness ?? 1}" fill="currentColor"/>`,
        );
        break;
      case 'cutLine':
        parts.push(
          `<line x1="${op.x}" y1="${op.y}" x2="${op.x + op.w}" y2="${op.y}"` +
            ` stroke="currentColor" stroke-width="${op.thickness ?? 2}" stroke-dasharray="${op.dash ?? 12} ${op.gap ?? 6}" shape-rendering="crispEdges"/>`,
        );
        break;
      case 'rect':
        parts.push(
          `<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}"` +
            ` fill="${op.filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1" shape-rendering="crispEdges"/>`,
        );
        break;
      case 'text':
        parts.push(textMarkup(op));
        break;
      case 'barcode':
        parts.push(barcodeMarkup(op));
        break;
      case 'qr':
        parts.push(qrMarkup(op));
        break;
      default:
        break; // init / note carry no pixels
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dots} ${height}"` +
    ` width="${dots}" height="${height}" class="label-svg" role="img"` +
    ` aria-label="${escape(title || 'Label preview')}">` +
    `<rect x="0" y="0" width="${dots}" height="${height}" fill="#fff"/>` +
    `<g fill="currentColor" color="#111" stroke="none">${parts.join('')}</g>` +
    `</svg>`
  );
}
