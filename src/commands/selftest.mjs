import EscPosBuilder from '../escpos/builder.mjs';
import { PrinterConnection } from '../ble/connect.mjs';
import { loadConfig, loadProfile, saveProfile } from '../config.mjs';
import { code128, code128ModuleCount } from '../escpos/barcode.mjs';
import { encodeQR, matrixToRaster } from '../escpos/qr.mjs';

/**
 * Print a test page. With no arguments it prints the full diagnostic page
 * (fonts, emphasis, rules, CODE128 and a QR) so you can tell at a glance
 * whether the paper width, density and character set are right.
 */
export function buildSelfTest({ paper = 58, tracking = 'SPXID065670267489' } = {}) {
  const cols = paper === 80 ? 48 : 32;
  const b = new EscPosBuilder();
  b.init();
  b.setDots(3);
  b.codePage(0);
  b.lineSpacing(24);

  b.align('center').bold(true).size(1, 2).text('SELF TEST');
  b.size(1, 1).text(`${paper}mm / ${cols} cols\n`);
  b.bold(false);

  b.text('ABCDEFGHIJKLMNOPQRSTUVWXYZ\n');
  b.text('abcdefghijklmnopqrstuvwxyz\n');
  b.text('0123456789 !\"#$%&()*+,-./\n');
  b.text(':;<=>?@[\\]^_`{|}~\n');
  b.text('Indonesian: Terima kasih!\n');

  b.size(1, 2).text('DOUBLE HEIGHT\n');
  b.size(2, 1).text('DOUBLE WIDTH\n');
  b.size(1, 1);

  b.bold(true).text('BOLD ON').bold(false).text('  normal  ');
  b.emphasis(true).text('EMPHASIS').emphasis(false).text('\n');
  b.underline(true).text('UNDERLINE').underline(false).text('\n');

  b.align('left');
  b.text(`${'-'.repeat(cols)}\n`);
  b.text('Printable area ruler:\n');
  // 0.5mm ticks: 8 dots at 203dpi, 32 ticks fit a 48mm print head.
  for (let i = 0; i < (paper === 80 ? 48 : 32); i++) {
    b.text(i % 5 === 0 ? '|' : ':');
  }
  b.text('\n');
  b.text('0123456789012345678901234567890123456789\n'.slice(0, cols + 10) + '\n');
  b.text(`${'-'.repeat(cols)}\n`);

  b.align('center').bold(true);
  b.text('CODE128\n');
  b.bold(false);
  b.raw([0x1d, 0x68, 0x00]); // HRI off, we print our own caption
  b.raw([0x1d, 0x77, 2]); // module width 2
  b.raw([0x1d, 0x6b, 69, tracking.length]);
  b.raw(new TextEncoder().encode(tracking));
  b.text('\n');
  b.text(`${tracking}\n`);
  b.text(`modules=${code128ModuleCount(tracking)} width=2\n`);

  const { matrix } = encodeQR('https://spx.co.id/' + tracking, { ecLevel: 'M' });
  b.raster(matrixToRaster(matrix, { scale: 3 }), 0);
  b.feedLines(1);
  b.text('QR raster (GS v 0)\n');

  b.text('\nIf this line is cut off on the right,\n');
  b.text('reduce the font or use a wider paper roll.\n');

  b.feedLines(3);
  b.cut('partial', 24);
  b.resetStyle();
  return b.build();
}

export async function runSelfTest(opts) {
  const target = await resolveTarget(opts);
  const bytes = buildSelfTest({ paper: opts.paper ?? 58, tracking: opts.tracking ?? 'SPXID065670267489' });
  process.stdout.write(`self test: ${bytes.length} bytes -> ${target.id}\n`);

  if (opts.dryRun) {
    process.stdout.write('dry run: nothing sent\n');
    return;
  }

  const conn = await PrinterConnection.connect(target.id, { timeout: opts.timeout ?? 15000 });
  conn.chunkSize = opts.chunkSize ?? 180;
  conn.chunkDelayMs = opts.chunkDelayMs ?? 18;
  try {
    let last = -1;
    const sent = await conn.write(bytes, {
      target: opts.writeUuid ?? target.writeUuid,
      onProgress: (d, t) => {
        const pct = Math.floor((d / t) * 100);
        if (pct >= last + 20) {
          last = pct;
          process.stdout.write(`  ${pct}%\n`);
        }
      },
    });
    process.stdout.write(`sent ${sent} bytes\n`);
    if (opts.writeUuid && target.name) {
      const profile = await loadProfile(target.name);
      if (profile) await saveProfile(target.name, { ...profile, writeUuid: opts.writeUuid });
      process.stdout.write(`profile "${target.name}" now writes via ${opts.writeUuid}\n`);
    }
  } finally {
    await conn.disconnect();
  }
}

async function resolveTarget(opts) {
  if (opts.device) {
    const profile = await loadProfile(opts.device);
    return {
      id: opts.device,
      name: profile?.name ?? null,
      writeUuid: opts.writeUuid ?? profile?.writeUuid,
    };
  }
  const config = await loadConfig();
  if (!config.device) throw new Error('No printer selected. Pass --device <id|name> or run: resi probe --device <id> --save <name>');
  const profile = await loadProfile(config.device);
  return { id: config.device, name: profile?.name ?? null, writeUuid: opts.writeUuid ?? profile?.writeUuid };
}
