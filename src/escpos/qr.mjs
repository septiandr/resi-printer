import { create as createQr } from 'qrcode';

/**
 * QR helper built on the `qrcode` package. Returns a boolean matrix where
 * `true` is a dark module, ready to be handed to the ESC/POS raster command
 * or turned into an ASCII preview.
 */
export function encodeQR(text, { ecLevel = 'M' } = {}) {
  if (!text) throw new Error('QR: empty payload');
  const qr = createQr(text, { errorCorrectionLevel: ecLevel });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const matrix = new Array(size);
  for (let y = 0; y < size; y++) {
    const row = new Array(size);
    for (let x = 0; x < size; x++) {
      row[x] = data[y * size + x] ? 1 : 0;
    }
    matrix[y] = row;
  }
  return { matrix, size };
}

/** Scale a module matrix into the 1-byte-per-pixel raster ESC/POS expects. */
export function matrixToRaster(matrix, { scale = 3, quietZone = 4 } = {}) {
  const n = matrix.length;
  const dim = (n + quietZone * 2) * scale;
  const data = new Uint8Array(dim * dim).fill(1);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!matrix[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        const rowStart = (y + quietZone) * scale + dy;
        for (let dx = 0; dx < scale; dx++) {
          data[rowStart * dim + (x + quietZone) * scale + dx] = 0;
        }
      }
    }
  }
  return { width: dim, height: dim, data };
}

/** Terminal preview: '#' for dark, ' ' for light. */
export function matrixToAscii(matrix, { scale = 1, quietZone = 2 } = {}) {
  const n = matrix.length;
  const dim = n + quietZone * 2;
  const lines = [];
  for (let y = 0; y < dim; y++) {
    let line = '';
    for (let x = 0; x < dim; x++) {
      const my = y - quietZone;
      const mx = x - quietZone;
      const dark = my >= 0 && my < n && mx >= 0 && mx < n && matrix[my][mx];
      line += dark ? '█'.repeat(scale) : ' '.repeat(scale);
    }
    lines.push(line);
  }
  return lines.join('\n');
}
