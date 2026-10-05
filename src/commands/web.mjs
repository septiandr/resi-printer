import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

import { buildPlan } from '../render/plan.mjs';
import { planToSvg } from '../render/plansvg.mjs';
import { planToEscPos } from '../render/planescpos.mjs';
import { PAPER } from '../render/layout.mjs';
import { parseTextLabel, parseObjectLabel, parseBoxes } from '../label/parse.mjs';
import { validate } from '../label/model.mjs';
import { loadConfig, listProfiles, loadProfile } from '../config.mjs';
import { scan } from '../ble/scan.mjs';
import { PrinterConnection } from '../ble/connect.mjs';
import { decodePng, encodePng } from '../render/png.mjs';
import { imageToGray, NoRasteriser } from '../render/rasterize.mjs';
import { prepareBitmap, bitmapToEscPos, bitmapToGray, appendBlankRows, appendCutLine } from '../render/raster.mjs';
import { HTML } from './webui.mjs';
import { c } from './shared.mjs';

const MAX_BODY = 24 * 1024 * 1024;

/** Bumped whenever the UI or the import pipeline changes. */
export const BUILD = 'import-' + (process.env.NONE ?? 'r2-450dpi');

/** Prepared bitmaps from recent previews, so a print sends the previewed dots. */
const jobs = new Map();

/** One line per import, so what the browser sent is visible in the terminal. */
function log(message) {
  process.stdout.write(`${c.dim(new Date().toISOString().slice(11, 19))} ${message}\n`);
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`invalid JSON: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

/** Normalise whatever the browser sent into a plan + svg. */
function render(body) {
  const paper = Number(body.paper) === 80 ? 80 : 58;
  const dots = paper === 58 ? PAPER[58].dots : PAPER[80].dots;
  const barcodeLayout = ['auto', 'across', 'stack'].includes(body.barcodeLayout)
    ? body.barcodeLayout
    : 'auto';

  let label;
  if (body.label && typeof body.label === 'object') {
    label = parseObjectLabel(body.label, 'web');
  } else if (Array.isArray(body.boxes) && body.boxes.length) {
    // Text run out of a PDF in the browser, using the same box schema the
    // Node-side PDF reader produces.
    label = parseBoxes(body.boxes, { source: 'web-pdf' });
  } else if (typeof body.text === 'string' && body.text.trim()) {
    label = parseTextLabel(body.text);
  } else {
    throw new Error('belum ada isi: tempel teks, unggah PDF, atau isi form');
  }

  const { ok, errors } = validate(label);
  if (!ok) throw new Error(errors.join('; '));

  const cutLine = body.cutLine !== false;
  const plan = buildPlan(label, { paper, barcodeLayout, cutLine });
  return {
    paper,
    dots,
    barcodeLayout,
    label,
    notes: plan.filter((p) => p.type === 'note').map((p) => p.note),
    svg: planToSvg(plan, { dots, paper, title: label.trackingNumber }),
    bytes: planToEscPos(plan, { dots, codePage: Number(body.codePage) || 0, cut: body.cut === 'none' ? null : body.cut || 'partial' }),
  };
}

/** Saved printer profiles, plus the configured default. */
async function printerList() {
  const config = await loadConfig();
  const names = await listProfiles();
  const profiles = [];
  for (const name of names) {
    const p = await loadProfile(name);
    if (p) profiles.push({ name, id: p.id || p.address, label: p.label || p.name, service: p.service, write: p.writeUuid });
  }
  return { default: config.device, profiles };
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    const html = HTML();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(html);
  }

  if (req.method === 'GET' && path === '/api/printers') {
    return json(res, 200, { ...(await printerList()), papers: Object.entries(PAPER) });
  }

  if (req.method === 'POST' && path === '/api/scan') {
    const timeout = Number(url.searchParams.get('timeout')) || 8000;
    const devices = await scan({ timeout });
    return json(res, 200, { devices });
  }

  if (req.method === 'POST' && path === '/api/preview') {
    const body = await readBody(req);
    const out = render(body);
    return json(res, 200, {
      svg: out.svg,
      notes: out.notes,
      paper: out.paper,
      dots: out.dots,
      bytes: out.bytes.length,
      label: out.label,
    });
  }

  if (req.method === 'POST' && path === '/api/print') {
    const body = await readBody(req);
    const out = render(body);
    const config = await loadConfig();
    const id = body.device || config.device;
    if (!id) throw new Error('belum ada printer tersimpan - jalankan `resi scan` dulu');

    const conn = await PrinterConnection.connect(id, { timeout: Number(body.timeout) || 15000 });
    try {
      const target = body.writeUuid || config.writeUuid;
      const sent = await conn.write(out.bytes, target ? { target } : {});
      return json(res, 200, {
        ok: true,
        device: conn.name || id,
        bytes: sent,
        tracking: out.label.trackingNumber,
        notes: out.notes,
      });
    } finally {
      await conn.disconnect();
    }
  }

  if (req.method === 'POST' && path === '/api/import') {
    const body = await readBody(req);
    const paper = Number(body.paper) === 58 ? 58 : 80;
    const dots = paper === 58 ? PAPER[58].dots : PAPER[80].dots;

    // Prefer the uploaded file: the server then rasterises it exactly the way
    // `resi import` does, so the preview and the print come from one renderer.
    // A browser-rasterised image is only the fallback for machines with no PDF
    // rasteriser of their own.
    let gray;
    let source = 'server';
    if (body.file) {
      try {
        gray = await imageToGray({
          bytes: Buffer.from(body.file, 'base64'),
          name: body.name || 'upload.pdf',
          dpi: Number(body.dpi) || 450,
        });
      } catch (err) {
        if (!(err instanceof NoRasteriser) || !body.png) {
          throw new Error(err instanceof NoRasteriser ? err.message : `file tidak bisa dibaca: ${err.message}`);
        }
        gray = decodePng(Buffer.from(body.png, 'base64'));
        source = 'browser';
      }
    } else if (body.png) {
      try {
        gray = decodePng(Buffer.from(body.png, 'base64'));
      } catch (err) {
        throw new Error(`gambar tidak bisa dibaca: ${err.message}`);
      }
      source = 'browser';
    } else {
      throw new Error('request tidak berisi file');
    }

    const options = {
      dots,
      threshold: Number(body.threshold) || 128,
      dither: Boolean(body.dither),
      invert: Boolean(body.invert),
      margin: body.margin === undefined ? 3 : Number(body.margin),
      trim: body.trim !== false,
    };

    // The preview and the print have to be the same dots, so the prepared
    // bitmap is kept under a key covering every setting that can change it.
    // Printing then sends the very bytes the preview drew, with no second
    // rasterise to drift from it.
    // Blank paper under the label so tearing it off cannot chew the last row.
    // 203dpi is 8 dots to the millimetre.
    const bottomMM = Math.max(0, Number(body.bottom) || 0);
    const feed = Math.round(bottomMM * 8);
    const cutLine = body.cutLine !== false;

    const key = createHash('sha256')
      .update(
        JSON.stringify({
          file: body.file ? String(body.file).length : 0,
          png: body.png ? String(body.png).length : 0,
          name: body.name,
          dpi: body.dpi,
          ...options,
          cut: body.cut,
          feed,
          cutLine,
        })
    )
      .digest('hex');

    let job = jobs.get(key);
    if (!job) {
      const prepared = options.trim
        ? prepareBitmap(gray, options)
        : prepareBitmap(gray, { ...options, trim: false });
      // The blank paper below the label is part of what gets printed, so the
      // preview has to carry it too or the two would not be the same label.
      const withCutLine = cutLine ? appendCutLine(prepared) : prepared;
      const printable = appendBlankRows(withCutLine, feed);
      const bytes = bitmapToEscPos(printable, {
        cut: body.cut === 'none' ? null : body.cut || 'partial',
      });
      job = {
        bytes,
        png: encodePng(bitmapToGray(printable)).toString('base64'),
        source,
        sourceWidth: gray.width,
        sourceHeight: gray.height,
        dots,
        height: printable.height,
        heightMM: printable.heightMM,
        artHeight: prepared.height,
        bottomMM,
      };
      if (jobs.size >= 8) jobs.delete(jobs.keys().next().value);
      jobs.set(key, job);
    }

    if (body.print) {
      const config = await loadConfig();
      const id = body.device || config.device;
      if (!id) throw new Error('belum ada printer tersimpan - jalankan `resi scan` dulu');
      const conn = await PrinterConnection.connect(id, { timeout: Number(body.timeout) || 15000 });
      try {
        const target = body.writeUuid || config.writeUuid;
        const sent = await conn.write(job.bytes, target ? { target } : {});
        return json(res, 200, { ok: true, printed: sent, ...job, bytes: job.bytes.length });
      } finally {
        await conn.disconnect();
      }
    }

    log(
      `import ${body.print ? 'PRINT ' : 'preview'} ${source} dpi=${body.dpi ?? 450} ` +
        `${job.sourceWidth}x${job.sourceHeight} -> ${job.dots}x${job.height} ` +
        `+${job.bottomMM}mm bawah ${job.bytes.length}B`
    );
    return json(res, 200, { ...job, bytes: job.bytes.length, build: BUILD });
  }

  return json(res, 404, { error: 'not found' });
}

export async function runWeb(opts = {}) {
  const port = Number(opts.port) || 8137;
  const host = opts.host || '127.0.0.1';

  const server = createServer((req, res) => {
    const started = Date.now();
    const at = new Date().toISOString().slice(11, 19);
    const done = (status) =>
      log(`${req.method} ${req.url} -> ${status} in ${Date.now() - started}ms`);
    if (req.method !== 'GET') process.stdout.write(`\x1b[2m${at}\x1b[0m ${req.method} ${req.url}\n`);

    handle(req, res)
      .then(() => done(res.statusCode))
      .catch((err) => {
        if (!res.headersSent) json(res, 400, { error: err.message });
        else res.end();
        done(res.statusCode);
      });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const url = `http://${host}:${port}`;
  process.stdout.write(`\n  resi web running at \x1b[1m${url}\x1b[0m\n  press ctrl-c to stop\n\n`);

  if (opts.open !== false) {
    const { spawn } = await import('node:child_process');
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  }

  return new Promise(() => {}); // serve until interrupted
}
