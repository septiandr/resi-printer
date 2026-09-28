#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { runScan, runProbe, runDevices } from '../src/commands/ble.mjs';
import { runPrint, runPreview, runRaw, runExport } from '../src/commands/print.mjs';
import { runConfig } from '../src/commands/print.mjs';
import { runSelfTest } from '../src/commands/selftest.mjs';
import { runFeatureProbe } from '../src/commands/probe-features.mjs';
import { runWeb } from '../src/commands/web.mjs';
import { runImport } from '../src/commands/import.mjs';
import { usage } from '../src/commands/help.mjs';
import { loadConfig } from '../src/config.mjs';

const argv = process.argv.slice(2);
const command = argv[0];

/**
 * Read an option value. Supports `--name value`, `--name=value` and bare
 * `--name` (which yields true).
 */
function flag(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const eq = argv.find((a) => a.startsWith(prefix));
  if (eq) return eq.slice(prefix.length);
  const at = argv.indexOf(`--${name}`);
  if (at !== -1) {
    const next = argv[at + 1];
    if (next !== undefined && !next.startsWith('--')) return next;
    return true;
  }
  return fallback;
}

function positional() {
  const out = [];
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      if (!a.includes('=') && rest[i + 1] && !rest[i + 1].startsWith('--')) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

function options() {
  return {
    device: flag('device', undefined) ?? flag('id', undefined),
    paper: flag('paper', undefined) ? Number(flag('paper')) : undefined,
    cols: flag('cols', undefined) ? Number(flag('cols')) : undefined,
    file: flag('file', undefined),
    text: flag('text', undefined),
    codePage: flag('code-page', undefined) ? Number(flag('code-page')) : undefined,
    moduleWidth: flag('module-width', undefined) ? Number(flag('module-width')) : undefined,
    barcodeLayout: flag('barcode-layout', undefined),
    qr: argv.includes('--no-qr') ? false : flag('qr', undefined),
    noCut: argv.includes('--no-cut'),
    cut: flag('cut', undefined),
    timeout: flag('timeout', undefined) ? Number(flag('timeout')) : undefined,
    color: argv.includes('--color'),
    out: flag('out', undefined),
    dryRun: argv.includes('--dry-run'),
    yes: argv.includes('--yes'),
    save: flag('save', undefined),
    writeUuid: flag('write-uuid', undefined),
    tracking: flag('tracking', undefined),
    filter: flag('filter', undefined),
    notes: flag('notes', undefined),
    port: flag('port', undefined) ? Number(flag('port')) : undefined,
    dpi: flag('dpi', undefined),
    threshold: flag('threshold', undefined),
    scale: flag('scale', undefined),
    margin: flag('margin', undefined),
    bottom: flag('bottom', undefined),
    dither: argv.includes('--dither'),
    invert: argv.includes('--invert'),
    noTrim: argv.includes('--no-trim'),
    probeWidth: argv.includes('--probe-width'),
    open: !argv.includes('--no-open'),
  };
}

const COMMANDS = {
  scan: () => runScan(options()),
  probe: () => runProbe(options()),
  devices: () => runDevices(),
  print: () => runPrint(options()),
  preview: () => runPreview(options()),
  raw: () => runRaw(options()),
  export: () => runExport(options()),
  config: () => runConfig(options()),
  selftest: () => runSelfTest(options()),
  features: () => runFeatureProbe(options()),
  web: () => runWeb(options()),
  import: () => runImport(options(), positional()),
};

async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(usage());
    return;
  }
  if (command === '--version' || command === 'version') {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`Unknown command: ${command}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }

  const config = await loadConfig();
  const merged = { ...config, ...stripUndefined(options()), files: positional() };
  try {
    await handler(merged);
  } catch (err) {
    process.stderr.write(`\nError: ${err.message}\n`);
    if (process.env.RESI_DEBUG) process.stderr.write(`${err.stack}\n`);
    process.exitCode = 1;
  } finally {
    // CoreBluetooth keeps a native handle open; without this the CLI hangs
    // after finishing its work.
    const { shutdownNoble } = await import('../src/ble/scan.mjs');
    shutdownNoble();
  }
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

await main();
