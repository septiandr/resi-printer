import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
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
 * Rasterise all pages of a PDF to PNG byte buffers.
 *
 * Uses native macOS PDFKit helper when available to render every page fast and
 * at high DPI, falling back to Quick Look (qlmanage) or throwing NoRasteriser.
 */
export async function pdfToPngs(bytes, dpi = 450) {
  if (process.platform !== 'darwin') {
    throw new NoRasteriser(
      'this machine has no PDF rasteriser; use the browser fallback or convert the page to PNG'
    );
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'resi-raster-'));
  const file = path.join(dir, 'input.pdf');
  try {
    const { writeFile, readFile } = await import('node:fs/promises');
    await writeFile(file, bytes);

    const helper = path.resolve(import.meta.dirname, '../../bin/render-pdf');
    let usedHelper = false;

    if (!existsSync(helper)) {
      const swiftSrc = path.resolve(import.meta.dirname, '../bin/render-pdf.swift');
      if (existsSync(swiftSrc)) {
        try {
          await run('swiftc', ['-O', '-o', helper, swiftSrc]);
        } catch {
          // ignore compile error and use fallback
        }
      }
    }

    if (existsSync(helper)) {
      try {
        await run(helper, [file, dir, String(dpi)]);
        usedHelper = true;
      } catch {
        // helper failed, fall through to qlmanage
      }
    }

    if (usedHelper) {
      const made = await readdir(dir);
      const pngs = made.filter((f) => f.toLowerCase().endsWith('.png')).sort();
      if (pngs.length > 0) {
        return await Promise.all(pngs.map((p) => readFile(path.join(dir, p))));
      }
    }

    // Fallback: qlmanage (thumbnail of first page)
    const longPt = await pdfLongEdgePoints(bytes);
    const size = String(Math.max(600, edgePixelsForDpi(longPt, dpi, MAX_EDGE)));
    await run('qlmanage', ['-t', '-s', size, '-o', dir, file]);

    const made = await readdir(dir);
    const png = made.find((f) => f.toLowerCase().endsWith('.png'));
    if (!png) throw new Error('the PDF rasteriser produced no image');
    return [await readFile(path.join(dir, png))];
  } catch (err) {
    if (err instanceof NoRasteriser) throw err;
    if (err.code === 'ENOENT') throw new NoRasteriser('PDF rasteriser is not available');
    throw new Error(`could not rasterise the PDF: ${(err.stderr || err.message).toString().trim()}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Rasterise the first page of a PDF to PNG bytes (backward compatibility). */
export async function pdfToPng(bytes, dpi) {
  const list = await pdfToPngs(bytes, dpi);
  return list[0];
}

/**
 * Turn an imported file into an array of greyscale samples (one per page).
 */
export async function imagesToGray({ bytes, name = '', dpi = 450 }) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf' || (!ext && looksLikePdf(bytes))) {
    const pngs = await pdfToPngs(bytes, dpi);
    return pngs.map((p) => decodePng(p));
  }
  if (ext === '.png' || !ext) return [decodePng(bytes)];
  throw new NoRasteriser(`import supports .pdf and .png, not ${ext || 'this file type'}`);
}

/**
 * Turn an imported file into greyscale samples of the first page.
 */
export async function imageToGray(opts) {
  const list = await imagesToGray(opts);
  return list[0];
}

function looksLikePdf(bytes) {
  return Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';
}
