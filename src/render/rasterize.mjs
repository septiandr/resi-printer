import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { decodePng } from './png.mjs';
import { edgePixelsForDpi } from './raster.mjs';

const run = promisify(execFile);

/** Ceiling on a rasterised page's long edge, to bound memory and time. */
export const MAX_EDGE = 4000;

/** Thrown when this machine has no PDF rasteriser, so a caller can fall back. */
export class NoRasteriser extends Error {}

/** Longest edge of a PDF's first page, in points, so a dpi can be honoured. */
export async function pdfLongEdgePoints(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  try {
    const unit = (await doc.getPage(1)).getViewport({ scale: 1 });
    return Math.max(unit.width, unit.height);
  } finally {
    await doc.destroy();
  }
}

/**
 * Rasterise a PDF to PNG bytes.
 *
 * pdfjs can measure a page but it needs a canvas to draw one, which would mean a
 * native module. On macOS the system's own Quick Look renderer is used instead;
 * it takes the pixel size of the long edge, which comes from the page's real
 * dimensions since a PDF page is measured in points, 72 to the inch.
 *
 * Everything that imports a PDF goes through here, so the preview in the web UI
 * and the CLI produce the same dots from the same file.
 */
export async function pdfToPng(bytes, dpi) {
  if (process.platform !== 'darwin') {
    throw new NoRasteriser(
      'this machine has no PDF rasteriser; use the browser fallback or convert the page to PNG'
    );
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'resi-raster-'));
  const file = path.join(dir, 'page.pdf');
  try {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, bytes);

    const longPt = await pdfLongEdgePoints(bytes);
    const size = String(Math.max(600, edgePixelsForDpi(longPt, dpi, MAX_EDGE)));
    await run('qlmanage', ['-t', '-s', size, '-o', dir, file]);

    const made = await readdir(dir);
    const png = made.find((f) => f.toLowerCase().endsWith('.png'));
    if (!png) throw new Error('the PDF rasteriser produced no image');
    const { readFile } = await import('node:fs/promises');
    return await readFile(path.join(dir, png));
  } catch (err) {
    if (err instanceof NoRasteriser) throw err;
    if (err.code === 'ENOENT') throw new NoRasteriser('qlmanage is not available');
    throw new Error(`could not rasterise the PDF: ${(err.stderr || err.message).toString().trim()}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Turn an imported file into greyscale samples.
 *
 * `name` picks the route: a PNG is decoded as it is, a PDF is rasterised at the
 * requested dpi. Returns the same shape `decodePng` gives, so every later stage
 * - trim, scale, threshold, GS v 0 - is shared.
 */
export async function imageToGray({ bytes, name = '', dpi = 450 }) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf' || (!ext && looksLikePdf(bytes))) {
    return decodePng(await pdfToPng(bytes, dpi));
  }
  if (ext === '.png' || !ext) return decodePng(bytes);
  throw new NoRasteriser(`import supports .pdf and .png, not ${ext || 'this file type'}`);
}

function looksLikePdf(bytes) {
  return Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';
}
