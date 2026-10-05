import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fromFile } from '../label/load.mjs';
import { parseTextLabel, parseObjectLabel } from '../label/parse.mjs';
import { promptLabel } from '../label/prompt.mjs';
import { validate } from '../label/model.mjs';
import { PAPER } from '../render/layout.mjs';
import { buildPlan } from '../render/plan.mjs';
import { planNotes, planToAscii } from '../render/planascii.mjs';
import { planHeight, planToEscPos } from '../render/planescpos.mjs';
import { PrinterConnection } from '../ble/connect.mjs';
import { loadProfile, loadConfig, saveConfig } from '../config.mjs';
import { c, confirm } from './shared.mjs';

export async function runPreview(opts) {
  const labels = await gatherLabels(opts);
  if (!labels.length) throw new Error('Nothing to print');
  for (const label of labels) {
    report(label, opts);
    const r = render(label, opts);
    process.stdout.write(`\n${planToAscii(r.plan, { dots: r.dots, cols: opts.asciiCols ?? 64 })}\n`);
    for (const n of planNotes(r.plan)) process.stdout.write(`${c.dim(`note: ${n}`)}\n`);
    process.stdout.write(`${c.dim(`${r.bytes.length} bytes of ESC/POS · ${r.dots}x${r.height} dots · ${r.cols} cols`)}\n`);
  }
}

export async function runExport(opts) {
  const labels = await gatherLabels(opts);
  if (!labels.length) throw new Error('Nothing to print');
  const out = opts.out || (labels.length === 1 ? 'label.escpos' : 'labels.escpos');
  await mkdir(path.dirname(path.resolve(out)), { recursive: true });
  const payloads = [];
  for (const label of labels) {
    payloads.push(Buffer.from(render(label, opts).bytes));
  }
  const total = payloads.reduce((n, p) => n + p.length, 0);
  await writeFile(out, Buffer.concat(payloads));
  process.stdout.write(`${c.green('wrote')} ${out}  ${c.dim(`${labels.length} label(s), ${total} bytes`)}\n`);
}

export async function runPrint(opts) {
  const labels = await gatherLabels(opts);
  if (!labels.length) throw new Error('Nothing to print');

  for (const label of labels) {
    report(label, opts);
    const { bytes, cols, paper } = render(label, opts);

    if (opts.dryRun) {
      const r = render(label, opts);
      process.stdout.write(`\n${planToAscii(r.plan, { dots: r.dots, cols: opts.asciiCols ?? 64 })}\n`);
      process.stdout.write(`${c.dim(`${bytes.length} bytes, ${paper.name} / ${cols} cols`)}\n`);
      process.stdout.write(`${c.yellow('dry run: nothing sent')}\n`);
      continue;
    }

    const target = await resolveDevice(opts);
    if (!target) throw new Error('No printer selected. Pass --device <mac|id> or run: resi probe --device <id> --save <name>');

    if (!opts.yes && labels.length === 1 && !process.stdin.isTTY) {
      throw new Error('Refusing to print without --yes when stdin is not a terminal');
    }
    if (!opts.yes && process.stdin.isTTY) {
      const { ok } = await confirm(`Print this ${paper.name} label to ${target.name ?? target.id}?`);
      if (!ok) {
        process.stdout.write('cancelled\n');
        return;
      }
    }

    process.stdout.write(`\n${c.dim(`connecting to ${target.id}...`)}`);
    const conn = await PrinterConnection.connect(target.id, { timeout: opts.timeout ?? 15000 });
    conn.chunkSize = opts.chunkSize ?? 180;
    conn.chunkDelayMs = opts.chunkDelayMs ?? 18;
    process.stdout.write(`\r${c.green('connected')} ${c.dim(target.id)}            \n`);

    try {
      let lastPct = -1;
      const sent = await conn.write(bytes, {
        target: target.writeUuid,
        onProgress: (done, total) => {
          const pct = Math.floor((done / total) * 100);
          if (pct >= lastPct + 10) {
            lastPct = pct;
            process.stdout.write(`\r  sending ${String(pct).padStart(3)}%   `);
          }
        },
      });
      process.stdout.write(`\r${c.green(`sent ${sent} bytes`)}          \n`);
    } finally {
      await conn.disconnect();
    }
  }
}

export async function runRaw(opts) {
  const file = opts.file || opts.files?.[0];
  if (!file) throw new Error('Pass --file <path.escpos>');
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(file);
  const target = await resolveDevice(opts);
  if (!target) throw new Error('No printer selected. Pass --device <mac|id>');
  const conn = await PrinterConnection.connect(target.id, { timeout: opts.timeout ?? 15000 });
  try {
    const sent = await conn.write(bytes, { target: target.writeUuid });
    process.stdout.write(`${c.green('sent')} ${sent} bytes from ${file}\n`);
  } finally {
    await conn.disconnect();
  }
}

export async function runConfig(opts) {
  if (opts.paper) {
    if (!PAPER[opts.paper]) throw new Error(`Unknown paper width: ${opts.paper} (use 58 or 80)`);
    const config = await loadConfig();
    await saveConfig({ ...config, paper: opts.paper });
    process.stdout.write(`${c.green('saved')} paper=${opts.paper}\n`);
    return;
  }
  if (opts.device) {
    const config = await loadConfig();
    await saveConfig({ ...config, device: opts.device });
    process.stdout.write(`${c.green('saved')} device=${opts.device}\n`);
    return;
  }
  const config = await loadConfig();
  process.stdout.write(`${c.bold('config')}\n${JSON.stringify(config, null, 2)}\n`);
}

// ---------------------------------------------------------------------------

/** Compile a label into a dot plan plus its ESC/POS bytes. */
function render(label, opts) {
  const paper = opts.paper ?? 58;
  const dots = paper === 80 ? 576 : 384;
  const plan = buildPlan(label, {
    paper,
    density: 0,
    barcodeLayout: opts.barcodeLayout ?? 'auto',
    cutLine: opts.cutLine !== false,
  });
  const bytes = planToEscPos(plan, {
    dots,
    codePage: opts.codePage ?? 0,
    cut: opts.noCut ? 'none' : (opts.cut ?? 'partial'),
  });
  // font C is 6 dots wide
  return { plan, bytes, dots, height: planHeight(plan, dots), cols: Math.floor(dots / 6), paper: PAPER[paper] ?? { name: `${paper}mm` } };
}

async function gatherLabels(opts) {
  if (opts.text) return [withNotes(parseTextLabel(decodeMaybeBase64(opts.text)), opts)];
  if (opts.file) return (await fromFile(opts.file)).map((l) => withNotes(l, opts));
  if (opts.files?.length) {
    const out = [];
    for (const f of opts.files) out.push(...(await fromFile(f)).map((l) => withNotes(l, opts)));
    return out;
  }
  return [withNotes(await promptLabel({}), opts)];
}

function withNotes(label, opts) {
  if (opts.notes) label.notes = opts.notes;
  return label;
}

function decodeMaybeBase64(s) {
  const t = String(s);
  if (/^[A-Za-z0-9+/=\s]+$/.test(t) && t.replace(/\s/g, '').length > 40 && t.length % 4 === 0) {
    try {
      const decoded = Buffer.from(t, 'base64').toString('utf8');
      if (/^[\x09\x0a\x0d\x20-\x7e -￿]+$/.test(decoded)) return decoded;
    } catch { /* not base64 */ }
  }
  return t;
}

/**
 * Work out which peripheral to talk to. `--device` accepts either a saved
 * profile name ("rpp02n"), a stored CoreBluetooth id, or the printer's
 * advertised name - and name-based lookup keeps working on machines where the
 * CoreBluetooth UUID differs from the one the profile was saved with.
 */
async function resolveDevice(opts) {
  const config = await loadConfig();
  const ref = opts.device || config.device;
  if (!ref) return null;

  const profile = await loadProfile(ref);
  if (profile) {
    return {
      id: opts.device ? (ref === profile.name ? profile.id : ref) : ref,
      name: profile.name ?? profile.label,
      writeUuid: opts.writeUuid ?? profile.writeUuid,
    };
  }
  return { id: ref, name: null, writeUuid: opts.writeUuid ?? undefined };
}

function report(label, opts) {
  const { ok, errors, warnings } = validate(label);
  for (const w of warnings) process.stdout.write(`${c.yellow('warn')} ${w}\n`);
  if (!ok) {
    for (const e of errors) process.stdout.write(`${c.red('error')} ${e}\n`);
    throw new Error(`Label is not printable (${errors.join('; ')}). Fix the input or use the interactive form.`);
  }
  const paper = opts.paper ?? 58;
  process.stdout.write(`${c.dim(`resi ${label.trackingNumber} · ${PAPER[paper]?.name ?? paper} · ${label.items.length} item(s)`)}\n`);
}

