/** The single-page UI served by `resi web`. Kept as one string so there is no
 *  build step and nothing to install to use it. */
export function HTML() {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>resi - cetak label Shopee</title>
<style>
  :root {
    --bg: #0f1115; --panel: #171a21; --panel-2: #1e222b; --line: #2b303b;
    --text: #e6e9ef; --muted: #98a1b3; --accent: #f0a020; --accent-ink: #1a1206;
    --ok: #35c07f; --err: #ef5f5f;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  header {
    display: flex; align-items: center; gap: 12px; padding: 14px 20px;
    border-bottom: 1px solid var(--line); background: var(--panel);
    position: sticky; top: 0; z-index: 5;
  }
  header h1 { font-size: 16px; margin: 0; letter-spacing: .3px; }
  header h1 span { color: var(--accent); }
  header .spacer { flex: 1; }
  main { display: grid; grid-template-columns: 380px 1fr; min-height: calc(100vh - 57px); }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; } }

  .side { border-right: 1px solid var(--line); padding: 18px; background: var(--panel); }
  @media (max-width: 900px) { .side { border-right: 0; border-bottom: 1px solid var(--line); } }
  .side h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
    color: var(--muted); margin: 22px 0 10px;
  }
  .side h2:first-of-type { margin-top: 0; }

  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 5px; }
  input, select, textarea, button {
    font: inherit; color: var(--text); background: var(--panel-2);
    border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; width: 100%;
  }
  textarea { min-height: 150px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; resize: vertical; }
  input:focus, select:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .field { margin-bottom: 10px; }
  .check { display: flex; align-items: center; gap: 8px; }
  .check input { width: auto; }
  .check label { margin: 0; }

  button { cursor: pointer; font-weight: 600; }
  button:hover:not(:disabled) { border-color: var(--accent); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  button.primary:hover:not(:disabled) { filter: brightness(1.08); }
  button.ghost { background: transparent; }

  .stage { padding: 24px; overflow: auto; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin-bottom: 18px; }
  .toolbar .field { margin: 0; min-width: 130px; }

  .paper {
    background: #f6f6f6; border-radius: 6px; padding: 18px; display: flex;
    justify-content: center; box-shadow: 0 10px 40px rgba(0,0,0,.5);
  }
  .label-svg { width: 100%; max-width: 420px; height: auto; display: block; }
  .label-svg * { vector-effect: non-scaling-stroke; }

  .notes { margin: 14px 0 0; padding: 0; list-style: none; }
  .notes li {
    font-size: 12px; color: var(--muted); padding: 5px 9px; border-left: 2px solid var(--line);
    margin-bottom: 4px; background: var(--panel); border-radius: 0 4px 4px 0;
  }
  .status {
    margin-top: 14px; padding: 10px 12px; border-radius: 6px; font-size: 13px;
    display: none; white-space: pre-wrap;
  }
  .status.show { display: block; }
  .status.ok { background: rgba(53,192,127,.12); border: 1px solid var(--ok); color: #b6f0d3; }
  .status.err { background: rgba(239,95,95,.12); border: 1px solid var(--err); color: #f6c2c2; }
  .status.busy { background: var(--panel-2); border: 1px solid var(--line); color: var(--muted); }
  .empty { color: var(--muted); text-align: center; padding: 80px 20px; }
  .kbd { font-family: ui-monospace, Menlo, monospace; background: var(--panel-2); padding: 1px 5px; border-radius: 4px; }
  .items { display: grid; gap: 8px; }
  .item-row { display: grid; grid-template-columns: 44px 1fr 56px 30px; gap: 6px; align-items: center; }
  .item-row button { padding: 6px; }
  details { margin-bottom: 10px; }
  summary { cursor: pointer; font-size: 12px; color: var(--muted); margin-bottom: 8px; }
</style>
</head>
<body>
<header>
  <h1>resi <span>cetak label</span></h1>
  <div class="spacer"></div>
  <select id="device" style="width:auto; min-width:190px" title="Printer tujuan"></select>
  <button class="ghost" id="scan">Scan BLE</button>
</header>

<main>
  <aside class="side">
    <h2>Sumber</h2>
    <div class="field">
      <label for="srcmode">Input</label>
      <select id="srcmode">
        <option value="import" selected>Import PDF/PNG (sama persis)</option>
        <option value="pdf">PDF &rarr; baca teks &amp; gambar ulang</option>
        <option value="text">Tempel teks &rarr; gambar ulang</option>
        <option value="form">Isi form &rarr; gambar ulang</option>
      </select>
    </div>

    <div id="pane-text">
      <textarea id="rawtext" spellcheck="false" placeholder="SPXID065670267489&#10;Penerima: Edwin suryo laksono&#10;Alamat: Perumnas bumitelukjambe&#10;HP: 081234567890&#10;Pengirim: zera&#10;Berat: 800 gr&#10;Batas Kirim: 28-09-2026&#10;1x Cover Tutup Knalpot"></textarea>
      <div class="row" style="margin-top:10px">
        <button id="load-sample">Contoh</button>
        <button class="ghost" id="clear">Bersihkan</button>
      </div>
    </div>

    <div id="pane-pdf" hidden>
      <input type="file" id="pdf" accept="application/pdf" style="padding:8px">
      <p style="font-size:12px;color:var(--muted);margin:10px 0 0">
        <b>Mode gambar ulang.</b> Teks diekstrak dari PDF lalu label disusun ulang
        oleh program, jadi bentuk dan posisinya tidak sama dengan PDF aslinya.
        Untuk hasil yang sama persis, pakai tab <b>Import PDF/PNG</b>.
      </p>
    </div>

    <div id="pane-import" hidden>
      <input type="file" id="imgfile" accept="application/pdf,image/png" style="padding:8px">
      <p style="font-size:12px;color:var(--muted);margin:10px 0 0">
        Halaman dicetak sebagai gambar apa adanya - tidak ada teks yang dibaca ulang
        atau tata letak yang dibuat ulang.
      </p>
      <div class="row" style="margin-top:10px">
        <div class="field"><label for="imp-dpi">Resolusi</label>
          <select id="imp-dpi">
            <option value="150">150 dpi</option>
            <option value="300">300 dpi</option>
            <option value="450" selected>450 dpi (sama dengan resi import)</option>
            <option value="600">600 dpi</option>
          </select>
        </div>
        <div class="field"><label for="imp-margin">Margin</label>
          <select id="imp-margin">
            <option value="0">0</option><option value="3" selected>3</option>
            <option value="8">8</option><option value="16">16</option>
          </select>
        </div>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="field"><label for="imp-bottom">Margin bawah</label>
          <select id="imp-bottom">
            <option value="0">0 mm</option>
            <option value="5" selected>5 mm</option>
            <option value="8">8 mm</option>
            <option value="12">12 mm</option>
            <option value="100">=100 mm</option>
          </select>
        </div>
        <div class="field"><label for="imp-threshold">Gelap &ge;</label>
          <select id="imp-threshold">
            <option value="80">80</option><option value="128" selected>128</option>
            <option value="180">180</option><option value="210">210</option>
          </select>
        </div>
        <div class="field check" style="align-self:flex-end">
          <input type="checkbox" id="imp-dither"><label for="imp-dither">Dither</label>
        </div>
      </div>
      <div class="field check" style="margin-top:8px">
        <input type="checkbox" id="imp-trim" checked><label for="imp-trim">Potong margin putih</label>
      </div>
      <div class="field check">
        <input type="checkbox" id="imp-invert"><label for="imp-invert">Balik (terang jadi hitam)</label>
      </div>
    </div>

    <div id="pane-form" hidden>
      <div class="field"><label>No. resi</label><input id="f-track" placeholder="SPXID0..."></div>
      <div class="row">
        <div class="field"><label>Layanan</label><input id="f-service" value="ECO"></div>
        <div class="field"><label>Berat</label><input id="f-weight" value="800 gr"></div>
      </div>
      <div class="row">
        <div class="field"><label>Batas kirim</label><input id="f-shipby"></div>
        <div class="field"><label>No. pesanan</label><input id="f-order"></div>
      </div>
      <h2>Penerima</h2>
      <div class="field"><label>Nama</label><input id="f-rname"></div>
      <div class="field"><label>Alamat (satu baris per baris)</label><textarea id="f-raddr" style="min-height:80px"></textarea></div>
      <h2>Pengirim</h2>
      <div class="field"><label>Nama</label><input id="f-sname"></div>
      <div class="field"><label>Telepon</label><input id="f-sphone"></div>
      <div class="field"><label>Alamat</label><textarea id="f-saddr" style="min-height:60px"></textarea></div>
      <h2>Item</h2>
      <div class="items" id="items"></div>
      <button class="ghost" id="add-item" style="margin-top:8px">+ Tambah item</button>
    </div>

    <h2>Cetak</h2>
    <div class="row">
      <div class="field"><label>Kertas</label>
        <select id="paper"><option value="58">58 mm</option><option value="80" selected>80 mm</option></select>
      </div>
      <div class="field"><label>Barcode</label>
        <select id="bclayout">
          <option value="auto">auto</option>
          <option value="across">across</option>
          <option value="stack">stack</option>
        </select>
      </div>
    </div>
    <div class="field check" style="margin-top:4px">
      <input type="checkbox" id="cut" checked><label for="cut">Potong kertas</label>
    </div>
    <div class="row" style="margin-top:14px">
      <button class="primary" id="print">Cetak</button>
      <button class="ghost" id="refresh">Pratinjau</button>
    </div>
  </aside>

  <section class="stage">
    <div class="toolbar">
      <div class="field"><label>Zoom</label>
        <select id="zoom">
          <option value="0.35">35%</option><option value="0.5">50%</option>
          <option value="0.75" selected>75%</option><option value="1">100%</option>
        </select>
      </div>
      <div class="spacer" style="flex:1"></div>
      <div class="field" style="min-width:200px"><label>Status</label>
        <div id="meta" style="font-size:12px;color:var(--muted);padding:8px 0">-</div>
      </div>
    </div>
    <div class="paper" id="paperbox"><div class="empty" id="empty">Pratinjau akan muncul di sini</div></div>
    <ul class="notes" id="notes"></ul>
    <div class="status" id="status"></div>
  </section>
</main>

<script>
const $ = (id) => document.getElementById(id);
const MAX_EDGE = 4000; // stay clear of the browser's canvas size limit
let printers = [];
let debounce;

function say(msg, kind = 'busy') {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status show ' + kind;
}
function clearSay() { $('status').className = 'status'; }

function itemRow(it = {}) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML =
    '<input class="i-qty" value="' + (it.qty || '1') + '" title="Qty">' +
    '<input class="i-name" value="' + (it.name || '') + '" placeholder="Nama produk">' +
    '<input class="i-var" value="' + (it.variation || '') + '" placeholder="Varia">' +
    '<button class="ghost i-del" title="Hapus">x</button>';
  row.querySelector('.i-del').onclick = () => { row.remove(); };
  $('items').appendChild(row);
}
function collectItems() {
  return [...document.querySelectorAll('.item-row')].map((r) => ({
    qty: r.querySelector('.i-qty').value.trim() || '1',
    name: r.querySelector('.i-name').value.trim(),
    variation: r.querySelector('.i-var').value.trim(),
  })).filter((i) => i.name || i.variation);
}
function collectForm() {
  const lines = (t) => t.split('\\n').map((s) => s.trim()).filter(Boolean);
  return {
    trackingNumber: $('f-track').value.trim(),
    service: $('f-service').value.trim(),
    weight: $('f-weight').value.trim(),
    shipBy: $('f-shipby').value.trim(),
    orderNumber: $('f-order').value.trim(),
    receiver: { name: $('f-rname').value.trim(), address: lines($('f-raddr').value), phone: '' },
    sender: { name: $('f-sname').value.trim(), phone: $('f-sphone').value.trim(), address: lines($('f-saddr').value) },
    items: collectItems(),
  };
}

async function readPdf(file) {
  say('Membaca PDF...');
  const buf = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const vp = page.getViewport({ scale: 1 });
  const boxes = content.items
    .filter((it) => it.str && it.str.trim())
    .map((it) => {
      const t = it.transform;
      return {
        text: it.str, x: t[4], y: vp.height - t[5],
        size: Math.abs(t[3]) || it.height, width: it.width, page: 1,
      };
    });
  clearSay();
  return { boxes, width: vp.width, height: vp.height };
}

/** Read a file as base64, in slices so a big PDF does not blow the stack. */
async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

/**
 * Render in the browser, only for machines whose server cannot rasterise a PDF.
 *
 * The server normally does this itself so the preview and the print come from
 * one renderer; pdfjs in the browser is a different rasteriser and can differ by
 * a dot, which is exactly what a preview must not do.
 */
async function renderInBrowser(file) {
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (isPdf) {
    say('Merender halaman PDF di browser...');
    const buf = new Uint8Array(await file.arrayBuffer());
    const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const page = await doc.getPage(1);
    // PDF user space is points, 72 to the inch, so a page is rendered at a
    // requested dpi with scale = dpi / 72. Browsers also cap canvas sides
    // around 32k pixels, so keep a ceiling on the result.
    const unit = page.getViewport({ scale: 1 });
    const longPt = Math.max(unit.width, unit.height);
    const capped = Math.min(Number($('imp-dpi').value) / 72, MAX_EDGE / longPt);
    const vp = page.getViewport({ scale: capped });
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise;
  } else {
    say('Membaca gambar...');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('gambar tidak bisa dibaca')); img.src = url; });
      const k = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * k));
      canvas.height = Math.max(1, Math.round(img.height * k));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  return { gray, width: canvas.width, height: canvas.height };
}

async function grayToPngBase64(gray, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  for (let i = 0, p = 0; p < gray.length; p++, i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = gray[p];
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  return fileToBase64(new Blob([blob]));
}

async function importBody(doPrint) {
  const file = $('imgfile').files[0];
  if (!file) throw new Error('pilih file PDF atau PNG dulu');
  return {
    file: await fileToBase64(file),
    name: file.name,
    paper: Number($('paper').value),
    dpi: Number($('imp-dpi').value),
    threshold: Number($('imp-threshold').value),
    margin: Number($('imp-margin').value),
    bottom: Number($('imp-bottom').value),
    dither: $('imp-dither').checked,
    trim: $('imp-trim').checked,
    invert: $('imp-invert').checked,
    cut: $('cut').checked ? 'partial' : 'none',
    device: $('device').value,
    print: doPrint,
  };
}

/** POST an import, falling back to browser rendering only if the server cannot. */
async function postImport(doPrint) {
  const body = await importBody(doPrint);
  const send = async () => {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json() };
  };

  let { res, data } = await send();
  if (res.ok || !body.file) return data;

  // The server has no PDF rasteriser: render here and hand it a greyscale image.
  const { gray, width, height } = await renderInBrowser(fileOf(body));
  body.file = null;
  body.png = await grayToPngBase64(gray, width, height);
  ({ res, data } = await send());
  if (!res.ok) throw new Error(data.error || 'gagal memproses file');
  return data;
}

function fileOf(body) {
  const bin = atob(body.file);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], body.name || 'upload.pdf');
}

function showImport(data) {
  const zoom = Number($('zoom').value);
  $('paperbox').innerHTML =
    '<img src="data:image/png;base64,' + data.png + '" style="width:' + (data.dots * zoom * 0.353) + 'mm;image-rendering:pixelated">';
  $('notes').innerHTML = '';
  const how = data.source === 'browser'
    ? ' \u00b7 dirender di browser (server tidak punya rasteriser PDF)'
    : '';
  $('meta').textContent =
    (data.build ? data.build + ' \u00b7 ' : '') +
    data.dots + ' dots \u00b7 ' + data.height + ' baris \u00b7 ' +
    (data.heightMM ? data.heightMM + 'mm \u00b7 ' : '') +
    (data.sourceWidth ? 'sumber ' + data.sourceWidth + '\u00d7' + data.sourceHeight + ' \u00b7 ' : '') +
    (data.bottomMM ? '+' + data.bottomMM + 'mm bawah \u00b7 ' : '') +
    (data.bytes ? data.bytes.toLocaleString() + ' bytes' : 'siap cetak') + how;
  $('empty')?.remove();
}

async function importPreview() {
  clearSay();
  try {
    say('Meraster file...');
    showImport(await postImport(false));
    clearSay();
  } catch (e) { say(e.message, 'err'); }
}

async function importPrint() {
  const btn = $('print');
  btn.disabled = true;
  try {
    say('Menghubungkan ke printer...');
    const data = await postImport(true);
    showImport(data);
    say('Terkirim ' + data.printed.toLocaleString() + ' bytes (' + data.dots + ' dots \u00d7 ' + data.height + '), sama persis dengan pratinjau', 'ok');
  } catch (e) { say(e.message, 'err'); } finally { btn.disabled = false; }
}

async function buildBody() {
  const mode = $('srcmode').value;
  const base = { paper: Number($('paper').value), barcodeLayout: $('bclayout').value, cut: $('cut').checked ? 'partial' : 'none' };
  if (mode === 'form') return { ...base, label: collectForm() };
  if (mode === 'pdf') {
    const file = $('pdf').files[0];
    if (!file) throw new Error('pilih file PDF dulu');
    const { boxes } = await readPdf(file);
    return { ...base, boxes };
  }
  const text = $('rawtext').value.trim();
  if (!text) throw new Error('tempel teks label dulu');
  return { ...base, text };
}

async function preview() {
  clearSay();
  let body;
  try { body = await buildBody(); } catch (e) { say(e.message, 'err'); return; }
  say('Merender...');
  try {
    const res = await fetch('/api/preview', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'render gagal');
    $('paperbox').innerHTML = data.svg;
    const svg = $('paperbox').querySelector('svg');
    if (svg) svg.style.maxWidth = (data.dots * Number($('zoom').value) * 0.353) + 'mm';
    $('notes').innerHTML = data.notes.map((n) => '<li>' + n + '</li>').join('');
    $('meta').textContent = data.paper + 'mm \\u00b7 ' + data.dots + ' dots \\u00b7 ' + data.bytes.toLocaleString() + ' bytes';
    $('empty')?.remove();
    clearSay();
  } catch (e) {
    say(e.message, 'err');
  }
}

async function doPrint() {
  let body;
  try { body = await buildBody(); } catch (e) { say(e.message, 'err'); return; }
  body.device = $('device').value;
  const btn = $('print');
  btn.disabled = true;
  say('Menghubungkan ke printer...');
  try {
    const res = await fetch('/api/print', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'gagal mencetak');
    say('Terkirim: ' + data.bytes.toLocaleString() + ' bytes ke ' + data.device + (data.tracking ? ' (' + data.tracking + ')' : ''), 'ok');
  } catch (e) {
    say(e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

async function loadPrinters() {
  const res = await fetch('/api/printers');
  const data = await res.json();
  printers = data.profiles || [];
  const sel = $('device');
  sel.innerHTML = '';
  if (!printers.length) {
    sel.innerHTML = '<option value="">belum ada printer</option>';
    return;
  }
  for (const p of printers) {
    const o = document.createElement('option');
    o.value = p.id || p.address;
    o.textContent = (p.label || p.name || p.id) + (p.id === data.default ? ' (default)' : '');
    sel.appendChild(o);
  }
  if (data.default) sel.value = data.default;
}

async function doScan() {
  say('Memindai BLE sekitar 8 detik...');
  try {
    const res = await fetch('/api/scan');
    const data = await res.json();
    const found = (data.devices || []).map((d) => d.name || d.id).join(', ') || 'tidak ada';
    say('Ditemukan: ' + found, 'ok');
  } catch (e) { say(e.message, 'err'); }
}

const SAMPLE = [
  'SPXID065670267489', 'Penerima: Edwin suryo laksono',
  'Alamat: Perumnas bumitelukjambe blok j no 333 Rt 02 Rw',
  'Alamat: 08 desa sukaluyu, TELUKJAMBE TIMUR, KAB. KARAWANG',
  'HP: 081234567890', 'Pengirim: zera', 'Alamat: KAB. KLATEN', 'HP: 6285646444805',
  'Berat: 800 gr', 'Batas Kirim: 28-09-2026', 'No.Pesanan: 26092754QH0FXM',
  '1x Cover Tutup Knalpot Vario 125 / 150, PCX, Airblade - Model Baru',
].join('\\n');

$('srcmode').onchange = () => {
  for (const k of ['text', 'pdf', 'import', 'form']) $('pane-' + k).hidden = k !== $('srcmode').value;
  if ($('srcmode').value === 'import') importPreview(); else preview();
};
$('load-sample').onclick = () => { $('rawtext').value = SAMPLE; preview(); };
$('clear').onclick = () => { $('rawtext').value = ''; $('paperbox').innerHTML = '<div class="empty">Pratinjau akan muncul di sini</div>'; $('notes').innerHTML = ''; };
$('add-item').onclick = () => itemRow();
$('refresh').onclick = () => ($('srcmode').value === 'import' ? importPreview() : preview());
$('print').onclick = () => ($('srcmode').value === 'import' ? importPrint() : doPrint());
$('scan').onclick = doScan;
$('zoom').onchange = () => ($('srcmode').value === 'import' ? importPreview() : preview());
for (const id of ['paper', 'bclayout']) $(id).onchange = () => ($('srcmode').value === 'import' ? importPreview() : preview());
$('rawtext').oninput = () => { clearTimeout(debounce); debounce = setTimeout(preview, 500); };
$('pdf').onchange = preview;
$('imgfile').onchange = importPreview;
for (const id of ['imp-dpi', 'imp-margin', 'imp-bottom', 'imp-threshold', 'imp-dither', 'imp-trim', 'imp-invert']) {
  $(id).onchange = importPreview;
}
for (const id of document.querySelectorAll('#pane-form input, #pane-form textarea')) {
  id.oninput = () => { clearTimeout(debounce); debounce = setTimeout(preview, 600); };
}

itemRow();
loadPrinters();
$('rawtext').value = SAMPLE;
$('paperbox').innerHTML = '<div class="empty" id="empty">Pilih file PDF atau PNG untuk melihat pratinjau</div>';
say('Pilih file PDF atau PNG di panel kiri.', 'ok');
</script>
</body>
</html>`;
}
