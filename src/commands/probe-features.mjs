import EscPosBuilder, { ESC, GS } from '../escpos/builder.mjs';

/**
 * Print one page that exercises each ESC/POS feature the label renderer relies
 * on, one numbered band per feature, so a single print tells us exactly which
 * commands this printer honours.
 */
export function buildFeatureProbe({ dots = 384 } = {}) {
  const b = new EscPosBuilder();
  b.init();
  b.lineSpacing(24);

  const band = (n) => {
    b.resetStyle();
    b.align('left');
    b.text(`[${n}]`);
    b.text(' ');
  };

  // 1 - baseline text
  band(1);
  b.selectFont(0);
  b.text('fontA 0123456789 abcdefghijklmnop');
  b.text('\n');

  // 2 - font C (6x24)
  band(2);
  b.selectFont(2);
  b.text('fontC 0123456789 abcdefghijklmnop');
  b.text('\n');
  b.selectFont(0);

  // 3 - GS ! size 1x1
  band(3);
  b.size(1, 1);
  b.text('GS!1x1 baseline text');
  b.text('\n');

  // 4 - GS v 0 raster, 384 x 12 solid band
  band(4);
  const bar = { width: dots, height: 12, data: new Uint8Array(dots * 12).fill(1) };
  b.raster(bar, 0);
  b.text('\n');

  // 5 - raster then ESC d feed then text
  band(5);
  const bar2 = { width: dots, height: 8, data: new Uint8Array(dots * 8).fill(1) };
  b.raster(bar2, 0);
  b.absDots(24);
  b.absX(0);
  b.text('after raster + ESC d');
  b.text('\n');

  // 6 - ESC $ absolute horizontal position
  band(6);
  b.absX(120);
  b.text('|x=120');
  b.text('\n');

  // 7 - ESC Q margin clear
  band(7);
  b.raw([ESC, 0x51, 0x00]); // ESC Q n - correct 2-byte form
  b.text('ESC Q cleared');
  b.text('\n');

  // 8 - barcode via the printer engine (GS k 69)
  band(8);
  b.align('center');
  b.raw([GS, 0x68, 0x00]);
  b.raw([GS, 0x77, 2]);
  const payload = new TextEncoder().encode('SPXID065670267489');
  b.raw([GS, 0x6b, 69, payload.length]);
  b.raw(payload);
  b.text('\n');

  // 9 - a narrow raster, like the barcode strip
  band(9);
  b.align('left');
  const strip = { width: 200, height: 16, data: new Uint8Array(200 * 16) };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 200; x++) strip.data[y * 200 + x] = (x >> 1) & 1;
  }
  b.raster(strip, 0);
  b.text('\n');

  // 10 - vertical bars only (frame edges)
  band(10);
  const edges = { width: dots, height: 10, data: new Uint8Array(dots * 10) };
  for (let y = 0; y < 10; y++) {
    edges.data[y * dots] = 1;
    edges.data[y * dots + 1] = 1;
    edges.data[y * dots + dots - 1] = 1;
    edges.data[y * dots + dots - 2] = 1;
  }
  b.raster(edges, 0);
  b.text('\n');

  b.resetStyle();
  b.feedLines(3);
  b.cut('partial', 24);
  return b.build();
}

export async function runFeatureProbe(opts) {
  const bytes = buildFeatureProbe({ dots: opts.paper === 80 ? 576 : 384 });
  process.stdout.write(`feature probe: ${bytes.length} bytes\n`);
  if (opts.dryRun) return;

  const { PrinterConnection } = await import('../ble/connect.mjs');
  const { loadProfile, loadConfig } = await import('../config.mjs');
  const ref = opts.device || (await loadConfig()).device;
  const profile = await loadProfile(ref);
  const conn = await PrinterConnection.connect(ref, { timeout: opts.timeout ?? 15000 });
  try {
    const sent = await conn.write(bytes, { target: profile?.writeUuid });
    process.stdout.write(`sent ${sent} bytes to ${profile?.name ?? ref}\n`);
  } finally {
    await conn.disconnect();
  }
}
