import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { loadConfig } from '../config.mjs';
import { PrinterConnection } from '../ble/connect.mjs';
import { prepareBitmap, bitmapToEscPos, trimWhite } from '../render/raster.mjs';
import { imageToGray } from '../render/rasterize.mjs';
import { PAPER } from '../render/layout.mjs';
import { c, confirm } from './shared.mjs';

/** Highest dot count worth probing: 80mm at 203dpi is 639. */
const PROBE_DOTS = 640;

export async function runImport(opts = {}, positional = []) {
  const config = await loadConfig();

  if (opts.probeWidth) {
    const target = opts.device || config.device;
    if (!target) throw new Error('no printer selected');
    const bytes = bitmapToEscPos(probeWidthBytes(), { cut: 'partial', lead: 40 });
    process.stdout.write(
      `\n${c.yellow('print head probe')} ${PROBE_DOTS} dots wide\n` +
        `  bar 1  dots 576..639\n` +
        `  bar 2  dots 464..639\n` +
        `  ticks  every 32 dots, tall every 128\n` +
        `  strip  dots 0..575\n` +
        `  bar 5  dots 0..63\n\n`
    );
    if (opts.out) {
      await writeFile(opts.out, bytes);
      process.stdout.write(`${c.green('wrote')} ${opts.out}\n`);
      return 0;
    }
    if (!opts.yes && !(await confirm('print the probe?'))) return 1;
    const conn = await PrinterConnection.connect(target, { timeout: opts.timeout ?? 15000 });
    try {
      await conn.write(bytes);
    } finally {
      await conn.disconnect();
    }
    process.stdout.write(`${c.green('sent')} ${bytes.length} bytes\n`);
    return 0;
  }

  const file = positional[0] || opts.file;
  if (!file) {
    process.stdout.write(`${USAGE}\n`);
    return 1;
  }
  if (!existsSync(file)) throw new Error(`no such file: ${file}`);

  const paper = Number(opts.paper) === 58 ? 58 : 80;
  const dots = PAPER[paper].dots;
  const dpi = Number(opts.dpi) || 450;
  const margin = opts.margin === undefined ? 3 : Number(opts.margin);
  // Blank paper under the label, so tearing it off does not chew the last row
  // of dots. 203dpi is 8 dots to the millimetre.
  const bottom = opts.bottom === undefined ? 5 : Math.max(0, Number(opts.bottom));
  const feed = Math.round(bottom * 8);

  process.stdout.write(`${c.dim('reading')} ${file}\n`);
  const gray = await imageToGray({ bytes: await readFile(file), name: file, dpi });
  const trimmed = opts.noTrim ? gray : trimWhite(gray, { margin });
  process.stdout.write(
    `${c.dim('image')} ${gray.width}x${gray.height}` +
      (trimmed.width !== gray.width || trimmed.height !== gray.height
        ? ` ${c.dim(`-> trimmed to ${trimmed.width}x${trimmed.height}`)}`
        : '') +
      '\n'
  );

  let bitmap = prepareBitmap(trimmed, {
    dots,
    threshold: Number(opts.threshold) || 128,
    dither: Boolean(opts.dither),
    invert: Boolean(opts.invert),
    trim: false, // already trimmed above
  });

  if (opts.scale) {
    const pct = Number(opts.scale) / 100;
    bitmap = prepareBitmap(trimmed, { dots, threshold: Number(opts.threshold) || 128, dither: Boolean(opts.dither), invert: Boolean(opts.invert), trim: false });
    bitmap = { ...bitmap, width: Math.max(8, Math.round(bitmap.width * pct)), data: bitmap.data };
  }

  const bytes = bitmapToEscPos(bitmap, {
    cut: opts.cut === 'none' ? null : opts.cut || 'partial',
    feed,
  });
  let ink = 0;
  for (const v of bitmap.data) ink += v;
  process.stdout.write(
    `${c.dim('bitmap')} ${dots}x${bitmap.height} dots ~${bitmap.heightMM}mm ` +
      `${c.dim(`+${bottom}mm bawah`)} ` +
      `${c.dim(`${((100 * ink) / bitmap.data.length).toFixed(1)}% ink`)}\n` +
      `${c.dim('payload')} ${bytes.length} bytes of ESC/POS\n`
  );

  if (opts.out) {
    await writeFile(opts.out, bytes);
    process.stdout.write(`${c.green('wrote')} ${opts.out}\n`);
    return 0;
  }

  const target = opts.device || config.device;
  if (!target) throw new Error('no printer selected - run `resi scan` first, or pass --device');
  if (!opts.yes && !(await confirm(`print to ${target}?`))) return 1;

  process.stdout.write(`${c.dim('connecting to')} ${target}...`);
  const conn = await PrinterConnection.connect(target, { timeout: opts.timeout ?? 15000 });
  try {
    const sent = await conn.write(bytes, {
      target: opts.writeUuid || config.writeUuid,
      onProgress: opts.onProgress,
    });
    process.stdout.write(`\r${c.green('sent')} ${sent} bytes          \n`);
  } finally {
    await conn.disconnect();
  }
  return 0;
}

export default runImport;
