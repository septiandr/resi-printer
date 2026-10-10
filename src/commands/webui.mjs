/** The single-page UI served by `resi web`. Kept as one string so there is no
 *  build step and nothing to install to use it.
 *
 *  Two rules keep this template literal honest: the browser code below uses
 *  string concatenation instead of template literals, and anything interpolated
 *  into markup is escaped first. Both avoid needing escapes that are easy to
 *  get wrong. */
export function HTML() {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>resi - cetak label Shopee</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0f1115; --panel: #171a21; --panel-2: #1e222b; --line: #2b303b;
    --text: #e6e9ef; --muted: #98a1b3; --accent: #f0a020; --accent-ink: #1a1206;
    --ok: #35c07f; --err: #ef5f5f; --warn: #e0b341;
    --paper: #f6f6f6; --shadow: 0 10px 40px rgba(0,0,0,.5);
    --tint-ok: rgba(53,192,127,.12); --tint-err: rgba(239,95,95,.12);
  }
  @media (prefers-color-scheme: light) {
    :root {
      color-scheme: light;
      --bg: #f3f4f7; --panel: #ffffff; --panel-2: #f2f4f7; --line: #d8dce3;
      --text: #191d24; --muted: #69707c; --accent: #a35c00; --accent-ink: #ffffff;
      --ok: #0b6b3f; --err: #b3271b; --warn: #8a5d00;
      --paper: #ffffff; --shadow: 0 8px 26px rgba(20,25,35,.13);
      --tint-ok: rgba(16,121,74,.1); --tint-err: rgba(179,39,27,.1);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  :where(a, button, input, select, textarea, summary):focus-visible {
    outline: 2px solid var(--accent); outline-offset: 2px;
  }

  header {
    display: flex; align-items: center; gap: 12px; padding: 12px 20px;
    border-bottom: 1px solid var(--line); background: var(--panel);
    position: sticky; top: 0; z-index: 5; flex-wrap: wrap;
  }
  header h1 { font-size: 16px; margin: 0; letter-spacing: .3px; white-space: nowrap; }
  header h1 span { color: var(--accent); }
  header .spacer { flex: 1; }
  .header-tools { display: flex; align-items: center; gap: 8px; }
  #device { width: auto; min-width: 190px; }

  main { display: grid; grid-template-columns: 400px 1fr; min-height: calc(100vh - 57px); }
  @media (max-width: 980px) { main { grid-template-columns: 1fr; } }

  .side {
    border-right: 1px solid var(--line); padding: 18px; background: var(--panel);
    max-height: calc(100vh - 57px); overflow: auto; position: sticky; top: 57px;
  }
  @media (max-width: 980px) {
    .side { border-right: 0; border-bottom: 1px solid var(--line); max-height: none; position: static; }
  }
  .side h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
    color: var(--muted); margin: 24px 0 10px;
  }
  .side h2:first-of-type { margin-top: 0; }

  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 5px; }
  .hint { font-size: 11px; color: var(--muted); margin: 6px 0 0; line-height: 1.45; }
  .hint.warn { color: var(--warn); }
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

  .drop {
    border: 1.5px dashed var(--line); border-radius: 8px; padding: 22px 14px;
    text-align: center; color: var(--muted); font-size: 13px; cursor: pointer;
    background: var(--panel-2); transition: border-color .15s, background .15s;
  }
  .drop:hover, .drop.over { border-color: var(--accent); background: var(--tint-ok); color: var(--text); }
  .drop b { color: var(--text); }
  .drop .fname { display: block; margin-top: 8px; font-size: 12px; color: var(--ok); word-break: break-all; }

  .stage { padding: 24px; overflow: auto; display: flex; flex-direction: column; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin-bottom: 16px; }
  .toolbar .field { margin: 0; min-width: 120px; }
  .meta { font-size: 12px; color: var(--muted); padding: 8px 0; }

  .paper {
    background: var(--paper); border-radius: 6px; padding: 18px; display: flex;
    justify-content: center; box-shadow: var(--shadow); flex: 1;
  }
  .label-svg { width: 100%; max-width: 420px; height: auto; display: block; }
  .label-svg * { vector-effect: non-scaling-stroke; }
  .empty { color: var(--muted); text-align: center; padding: 80px 20px; margin: auto; max-width: 380px; }
  .empty b { color: var(--text); display: block; margin-bottom: 6px; font-size: 14px; }

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
  .status.ok { background: var(--tint-ok); border: 1px solid var(--ok); color: var(--ok); }
  .status.err { background: var(--tint-err); border: 1px solid var(--err); color: var(--err); }
  .status.busy { background: var(--panel-2); border: 1px solid var(--line); color: var(--muted); }
  .status.busy::before {
    content: ''; display: inline-block; width: 10px; height: 10px; margin-right: 8px;
    border: 2px solid var(--line); border-top-color: var(--accent);
    border-radius: 50%; animation: spin .7s linear infinite; vertical-align: -1px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .status.busy::before { animation: none; } }

  .items { display: grid; gap: 8px; }
  .item-row { display: grid; grid-template-columns: 48px 1fr 1fr 34px; gap: 6px; align-items: center; }
  .item-row button { padding: 6px; }
  details { margin-bottom: 10px; }
  details.adv { border: 1px solid var(--line); border-radius: 8px; padding: 0 12px; background: var(--panel-2); }
  details.adv > summary { cursor: pointer; font-size: 12px; color: var(--muted); padding: 10px 0; font-weight: 600; }
  details.adv > div { padding-bottom: 12px; }

  dialog {
    border: 1px solid var(--line); border-radius: 10px; background: var(--panel);
    color: var(--text); padding: 0; max-width: 460px; width: calc(100% - 40px);
    box-shadow: var(--shadow);
  }
  dialog::backdrop { background: rgba(0,0,0,.55); }
  .dlg-head, .dlg-foot {
    display: flex; align-items: center; gap: 10px; padding: 14px 16px;
  }
  .dlg-head { border-bottom: 1px solid var(--line); }
  .dlg-head strong { flex: 1; font-size: 14px; }
  .dlg-foot { border-top: 1px solid var(--line); }
  .dlg-foot .spacer { flex: 1; }
  .dlg-head button { width: auto; padding: 4px 10px; font-size: 18px; line-height: 1; }
  .scanlist { padding: 8px 16px 16px; max-height: 55vh; overflow: auto; }
  .scanrow {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 10px; margin-bottom: 8px; text-align: left; font-weight: 400;
  }
  .scanrow .nm { flex: 1; min-width: 0; }
  .scanrow .nm b { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scanrow .nm small { color: var(--muted); font-size: 11px; font-family: ui-monospace, Menlo, monospace; }
  .scanrow .rssi { font-size: 11px; color: var(--muted); white-space: nowrap; }
  .scanrow.picked { border-color: var(--accent); }
  .kbd { font-family: ui-monospace, Menlo, monospace; background: var(--panel-2); padding: 1px 5px; border-radius: 4px; }
</style>
</head>
<body>
<header>
  <h1>resi <span>cetak label</span></h1>
  <div class="spacer"></div>
  <div class="header-tools">
    <select id="device" title="Printer tujuan" aria-label="Printer tujuan"></select>
    <button class="ghost" id="scan" type="button">Scan BLE</button>
  </div>
</header>

<main>
  <aside class="side">
    <h2>Sumber label</h2>
    <div class="field">
      <label for="srcmode">Cara memuat label</label>
      <select id="srcmode">
        <option value="import" selected>Import PDF/PNG (sama persis)</option>
        <option value="pdf">PDF &rarr; baca teks &amp; gambar ulang</option>
        <option value="text">Tempel teks &rarr; gambar ulang</option>
        <option value="form">Isi form &rarr; gambar ulang</option>
      </select>
    </div>

    <div id="pane-import" hidden>
      <div class="drop" id="drop" tabindex="0" role="button"
           aria-label="Pilih atau seret file PDF atau PNG ke sini">
        <b>Klik untuk pilih file</b>, atau seret ke sini
        <span class="fname" id="dropname"></span>
      </div>
      <input type="file" id="imgfile" accept="application/pdf,image/png" hidden>
      <p class="hint">Halaman dicetak sebagai gambar apa adanya - tidak ada teks yang
        dibaca ulang atau tata letak yang dibuat ulang.</p>
      <details class="adv" style="margin-top:12px">
        <summary>Pengaturan raster lanjutan</summary>
        <div>
          <div class="row">
            <div class="field">
              <label for="imp-dpi">Resolusi</label>
              <select id="imp-dpi">
                <option value="150">150 dpi</option>
                <option value="300">300 dpi</option>
                <option value="450" selected>450 dpi (sama dengan resi import)</option>
                <option value="600">600 dpi</option>
              </select>
            </div>
            <div class="field">
              <label for="imp-threshold">Gelap &ge;</label>
              <select id="imp-threshold">
                <option value="80">80 - Printing lebih terang</option>
                <option value="128" selected>128 - standar</option>
                <option value="180">180 - lebih pekat</option>
                <option value="210">210 - pekat sekali</option>
              </select>
            </div>
          </div>
          <p class="hint">Naikkan <b>Gelap &ge;</b> bila garis tipis atau barcode
           hilang saat dicetak.</p>
          <div class="row">
            <div class="field">
              <label for="imp-margin">Margin kiri/atas</label>
              <select id="imp-margin">
                <option value="0">0 dot</option>
                <option value="3" selected>3 dot</option>
                <option value="8">8 dot</option>
                <option value="16">16 dot</option>
              </select>
            </div>
            <div class="field">
              <label for="imp-bottom">Margin bawah</label>
              <select id="imp-bottom">
                <option value="0">0 mm (tanpa margin)</option>
                <option value="5" selected>5 mm</option>
                <option value="10">10 mm</option>
                <option value="15">15 mm</option>
                <option value="20">20 mm</option>
                <option value="25">25 mm</option>
                <option value="30">30 mm</option>
              </select>
            </div>
          </div>
          <p class="hint">Margin bawah memberi ruang kosong sebelum garis potong (garis potong di ujung margin).</p>
          <div class="field check">
            <input type="checkbox" id="imp-dither"><label for="imp-dither">Dither (untuk gambar abu-abu)</label>
          </div>
          <div class="field check">
            <input type="checkbox" id="imp-trim" checked><label for="imp-trim">Potong margin putih</label>
          </div>
          <div class="field check">
            <input type="checkbox" id="imp-invert"><label for="imp-invert">Balik (terang jadi hitam)</label>
          </div>
        </div>
      </details>
    </div>

    <div id="pane-pdf" hidden>
      <label for="pdf">Pilih file PDF</label>
      <input type="file" id="pdf" accept="application/pdf" style="padding:8px">
      <p class="hint warn"><b>Mode gambar ulang.</b> Teks diekstrak dari PDF lalu
        label disusun ulang oleh program, jadi bentuk dan posisinya tidak sama dengan
        PDF aslinya. Untuk hasil yang sama persis, pakai <b>Import PDF/PNG</b>.</p>
    </div>

    <div id="pane-text" hidden>
      <textarea id="rawtext" spellcheck="false" aria-label="Teks label" placeholder="SPXID065670267489&#10;Penerima: Edwin suryo laksono&#10;Alamat: Perumnas bumitelukjambe&#10;HP: 081234567890&#10;Pengirim: zera&#10;Berat: 800 gr&#10;Batas Kirim: 28-09-2026&#10;1x Cover Tutup Knalpot"></textarea>
      <div class="row" style="margin-top:10px">
        <button id="load-sample" type="button">Contoh</button>
        <button class="ghost" id="clear" type="button">Bersihkan</button>
      </div>
    </div>

    <div id="pane-form" hidden>
      <div class="field"><label for="f-track">No. resi</label><input id="f-track" placeholder="SPXID0..."></div>
      <div class="row">
        <div class="field"><label for="f-service">Layanan</label><input id="f-service" value="ECO"></div>
        <div class="field"><label for="f-weight">Berat</label><input id="f-weight" value="800 gr"></div>
      </div>
      <div class="row">
        <div class="field"><label for="f-shipby">Batas kirim</label><input id="f-shipby"></div>
        <div class="field"><label for="f-order">No. pesanan</label><input id="f-order"></div>
      </div>
      <h2>Penerima</h2>
      <div class="field"><label for="f-rname">Nama</label><input id="f-rname"></div>
      <div class="field"><label for="f-raddr">Alamat (satu baris per baris)</label><textarea id="f-raddr" style="min-height:80px"></textarea></div>
      <h2>Pengirim</h2>
      <div class="field"><label for="f-sname">Nama</label><input id="f-sname"></div>
      <div class="field"><label for="f-sphone">Telepon</label><input id="f-sphone"></div>
      <div class="field"><label for="f-saddr">Alamat</label><textarea id="f-saddr" style="min-height:60px"></textarea></div>
      <h2>Item</h2>
      <div class="items" id="items"></div>
      <button class="ghost" id="add-item" type="button" style="margin-top:8px">+ Tambah item</button>
    </div>

    <h2>Cetak</h2>
    <div class="row">
      <div class="field">
        <label for="paper">Lebar kertas</label>
        <select id="paper"><option value="58">58 mm</option><option value="80" selected>80 mm</option></select>
      </div>
      <div class="field">
        <label for="bclayout">Tata letak barcode</label>
        <select id="bclayout">
          <option value="auto">auto</option>
          <option value="across">across (sejajar)</option>
          <option value="stack">stack (bertumpuk)</option>
        </select>
      </div>
    </div>
    <div class="field check" style="margin-top:4px">
      <input type="checkbox" id="cutline" checked><label for="cutline">Garis potong di bagian bawah</label>
    </div>
    <div class="field check">
      <input type="checkbox" id="cut" checked><label for="cut">Potong kertas setelah cetak</label>
    </div>
    <div class="row" style="margin-top:14px">
      <button class="primary" id="print" type="button">Cetak</button>
      <button class="ghost" id="refresh" type="button">Pratinjau</button>
    </div>
  </aside>

  <section class="stage">
    <div class="toolbar">
      <div class="field">
        <label for="zoom">Zoom pratinjau</label>
        <select id="zoom">
          <option value="0.35">35%</option><option value="0.5">50%</option>
          <option value="0.75" selected>75%</option><option value="1">100%</option>
        </select>
      </div>
      <div class="spacer" style="flex:1"></div>
      <div class="field" style="min-width:220px">
        <label>Hasil render</label>
        <div class="meta" id="meta">-</div>
      </div>
    </div>
    <div class="paper" id="paperbox"></div>
    <ul class="notes" id="notes"></ul>
    <div class="status" id="status" role="status" aria-live="polite"></div>
  </section>
</main>

<dialog id="scandlg" aria-labelledby="scantitle">
  <div class="dlg-head">
    <strong id="scantitle">Perangkat BLE di sekitar</strong>
    <button class="ghost" id="scan-close" type="button" aria-label="Tutup">&times;</button>
  </div>
  <div class="scanlist" id="scanlist"></div>
  <div class="dlg-foot">
    <button class="ghost" id="scan-again" type="button">Scan lagi</button>
    <div class="spacer"></div>
    <button id="scan-done" type="button">Selesai</button>
  </div>
</dialog>

<script>
const $ = (id) => document.getElementById(id);
const MAX_EDGE = 4000; // stay clear of the browser's canvas size limit
const DOT_MM = 0.353;   // 203 dpi printer dot, in millimetres
let printers = [];
let debounce = 0;
let seq = 0;           // guards against an older preview landing after a newer one

/** Escape before going anywhere near markup. Values here come from pasted text. */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function say(msg, kind) {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status show' + (kind ? ' ' + kind : ' busy');
}
function clearSay() { $('status').className = 'status'; }
function fail(e) { say(e && e.message ? e.message : String(e), 'err'); }

/** One neutral empty state, always rebuilt the same way so it cannot go stale. */
function showEmpty(title, body) {
  const box = $('paperbox');
  box.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'empty';
  const b = document.createElement('b');
  b.textContent = title;
  d.appendChild(b);
  if (body) d.appendChild(document.createTextNode(body));
  box.appendChild(d);
}

/** Scale whatever is already on the paper, instead of rendering it again. */
function applyZoom() {
  const z = Number($('zoom').value);
  const img = $('paperbox').querySelector('img');
  if (img) { img.style.width = (Number(img.dataset.dots) * z * DOT_MM) + 'mm'; return; }
  const svg = $('paperbox').querySelector('svg');
  if (svg) svg.style.maxWidth = (Number(svg.dataset.dots) * z * DOT_MM) + 'mm';
}

function itemRow(it = {}) {
  const row = document.createElement('div');
  row.className = 'item-row';
  const qty = document.createElement('input');
  qty.className = 'i-qty'; qty.value = it.qty || '1';
  qty.placeholder = '1'; qty.title = 'Jumlah'; qty.setAttribute('aria-label', 'Jumlah');
  const name = document.createElement('input');
  name.className = 'i-name'; name.value = it.name || '';
  name.placeholder = 'Nama produk'; name.setAttribute('aria-label', 'Nama produk');
  const variation = document.createElement('input');
  variation.className = 'i-var'; variation.value = it.variation || '';
  variation.placeholder = 'Varian'; variation.setAttribute('aria-label', 'Varian');
  const del = document.createElement('button');
  del.className = 'ghost i-del'; del.type = 'button'; del.textContent = 'x';
  del.title = 'Hapus'; del.setAttribute('aria-label', 'Hapus item');
  del.onclick = () => { row.remove(); schedulePreview(); };
  row.append(qty, name, variation, del);
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
  const isPdf = /\\.pdf$/i.test(file.name) || file.type === 'application/pdf';
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

function importBody(doPrint) {
  const file = $('imgfile').files[0];
  if (!file) throw new Error('pilih file PDF atau PNG dulu');
  return fileToBase64(file).then((b64) => ({
    file: b64,
    name: file.name,
    paper: Number($('paper').value),
    dpi: Number($('imp-dpi').value),
    threshold: Number($('imp-threshold').value),
    margin: Number($('imp-margin').value),
    bottom: Number($('imp-bottom').value),
    dither: $('imp-dither').checked,
    trim: $('imp-trim').checked,
    invert: $('imp-invert').checked,
    cutLine: $('cutline').checked,
    cut: $('cut').checked ? 'partial' : 'none',
    device: $('device').value,
    print: doPrint,
  }));
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
  const box = $('paperbox');
  box.innerHTML = '';
  const img = document.createElement('img');
  img.src = 'data:image/png;base64,' + data.png;
  img.alt = 'Pratinjau label';
  img.dataset.dots = data.dots;
  img.style.imageRendering = 'pixelated';
  box.appendChild(img);
  $('notes').innerHTML = '';
  const how = data.source === 'browser'
    ? ' · dirender di browser (server tidak punya rasteriser PDF)'
    : '';
  $('meta').textContent =
    (data.build ? data.build + ' · ' : '') +
    data.dots + ' dots · ' + data.height + ' baris · ' +
    (data.heightMM ? data.heightMM + 'mm · ' : '') +
    (data.sourceWidth ? 'sumber ' + data.sourceWidth + '×' + data.sourceHeight + ' · ' : '') +
    (data.bottomMM ? '+' + data.bottomMM + 'mm bawah · ' : '') +
    (data.bytes ? data.bytes.toLocaleString() + ' bytes' : 'siap cetak') + how;
  applyZoom();
}

async function importPreview() {
  if (!$('imgfile').files[0]) {
    clearSay();
    showEmpty('Belum ada file', 'Pilih atau seret PDF/PNG ke kotak di panel kiri.');
    $('meta').textContent = '-';
    return;
  }
  const mine = ++seq;
  clearSay();
  say('Meraster file...');
  try {
    const data = await postImport(false);
    if (mine !== seq) return;
    showImport(data);
    clearSay();
  } catch (e) { if (mine === seq) fail(e); }
}

async function importPrint() {
  if (!$('imgfile').files[0]) { fail(new Error('pilih file PDF atau PNG dulu')); return; }
  const btn = $('print');
  btn.disabled = true;
  say('Menghubungkan ke printer...');
  try {
    const data = await postImport(true);
    showImport(data);
    say('Terkirim ' + data.printed.toLocaleString() + ' bytes (' + data.dots + ' dots × ' + data.height + '), sama persis dengan pratinjau', 'ok');
  } catch (e) { fail(e); } finally { btn.disabled = false; }
}

async function buildBody() {
  const mode = $('srcmode').value;
  const base = {
    paper: Number($('paper').value),
    barcodeLayout: $('bclayout').value,
    cutLine: $('cutline').checked,
    cut: $('cut').checked ? 'partial' : 'none',
  };
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
  try { body = await buildBody(); } catch (e) { fail(e); return; }
  const mine = ++seq;
  say('Merender...');
  try {
    const res = await fetch('/api/preview', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'render gagal');
    if (mine !== seq) return;
    $('paperbox').innerHTML = data.svg;
    const svg = $('paperbox').querySelector('svg');
    if (svg) svg.dataset.dots = data.dots;
    $('notes').innerHTML = data.notes.map((n) => '<li>' + esc(n) + '</li>').join('');
    $('meta').textContent = data.paper + 'mm · ' + data.dots + ' dots · ' + data.bytes.toLocaleString() + ' bytes';
    applyZoom();
    clearSay();
  } catch (e) {
    if (mine === seq) fail(e);
  }
}

async function doPrint() {
  let body;
  try { body = await buildBody(); } catch (e) { fail(e); return; }
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
    fail(e);
  } finally {
    btn.disabled = false;
  }
}

/** Add or reveal a device in the picker, so a scan result is usable right away. */
function setDevice(value, label) {
  const sel = $('device');
  const known = [...sel.options].some((o) => o.value === value);
  if (!known) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label + ' (hasil scan)';
    sel.appendChild(o);
  }
  sel.value = value;
  $('print').disabled = false;
}

async function loadPrinters() {
  let data;
  try {
    const res = await fetch('/api/printers');
    data = await res.json();
  } catch (e) { fail(e); return; }
  printers = data.profiles || [];
  const sel = $('device');
  sel.innerHTML = '';
  if (!printers.length) {
    sel.innerHTML = '<option value="">belum ada printer</option>';
    $('print').disabled = true;
    showEmpty('Printer belum siap', 'Tekan "Scan BLE" di header, pilih printer yang muncul, lalu lanjut. Untuk menyimpan agar tidak perlu scan lagi: resi probe --save <nama>.');
    return;
  }
  for (const p of printers) {
    const o = document.createElement('option');
    o.value = p.id || p.address;
    o.textContent = (p.label || p.name || p.id) + (p.id === data.default ? ' (default)' : '');
    sel.appendChild(o);
  }
  if (data.default) sel.value = data.default;
  $('print').disabled = !sel.value;
}

function renderScanList(devices) {
  const list = $('scanlist');
  list.innerHTML = '';
  if (!devices.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Tidak ada perangkat yang terlihat. Pastikan printer menyala dan Bluetooth tidak dimatikan.';
    list.appendChild(p);
    return;
  }
  for (const d of devices) {
    const row = document.createElement('button');
    row.className = 'scanrow ghost';
    row.type = 'button';
    const nm = document.createElement('span');
    nm.className = 'nm';
    const b = document.createElement('b');
    b.textContent = d.name || '(tanpa nama)';
    const small = document.createElement('small');
    small.textContent = d.id;
    nm.append(b, small);
    const rssi = document.createElement('span');
    rssi.className = 'rssi';
    rssi.textContent = d.rssi + ' dBm' + (d.connectable ? '' : ' · tidak bisa connect');
    row.append(nm, rssi);
    row.onclick = () => {
      setDevice(d.id, d.name || 'Perangkat');
      say('Printer tujuan: ' + (d.name || d.id) + '. Belum disimpan sebagai profil, jadi perlu dipilih lagi setelah refresh.', 'ok');
      $('scandlg').close();
    };
    list.appendChild(row);
  }
}

async function doScan() {
  const dlg = $('scandlg');
  if (!dlg.open) dlg.showModal();
  $('scanlist').innerHTML = '';
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = 'Memindai perangkat di sekitar, sekitar 8 detik...';
  $('scanlist').appendChild(p);
  $('scan-again').disabled = true;
  try {
    const res = await fetch('/api/scan');
    const data = await res.json();
    renderScanList(data.devices || []);
  } catch (e) {
    const p2 = document.createElement('p');
    p2.className = 'hint warn';
    p2.textContent = e && e.message ? e.message : 'scan gagal';
    $('scanlist').innerHTML = '';
    $('scanlist').appendChild(p2);
  } finally {
    $('scan-again').disabled = false;
  }
}

const SAMPLE = [
  'SPXID065670267489', 'Penerima: Edwin suryo laksono',
  'Alamat: Perumnas bumitelukjambe blok j no 333 Rt 02 Rw',
  'Alamat: 08 desa sukaluyu, TELUKJAMBE TIMUR, KAB. KARAWANG',
  'HP: 081234567890', 'Pengirim: zera', 'Alamat: KAB. KLATEN', 'HP: 6285646444805',
  'Berat: 800 gr', 'Batas Kirim: 28-09-2026', 'No.Pesanan: 26092754QH0FXM',
  '1x Cover Tutup Knalpot Vario 125 / 150, PCX, Airblade - Model Baru',
].join('\\n');

function isImport() { return $('srcmode').value === 'import'; }
function render() { return isImport() ? importPreview() : preview(); }
function schedulePreview() {
  clearTimeout(debounce);
  debounce = setTimeout(render, 500);
}
function showSource() {
  for (const k of ['text', 'pdf', 'import', 'form']) $('pane-' + k).hidden = k !== $('srcmode').value;
}

$('srcmode').onchange = () => { showSource(); render(); };
$('load-sample').onclick = () => { $('rawtext').value = SAMPLE; preview(); };
$('clear').onclick = () => {
  $('rawtext').value = '';
  $('notes').innerHTML = '';
  $('meta').textContent = '-';
  showEmpty('Teks dikosongkan', 'Tempel teks label atau tekan "Contoh" untuk melihat contoh.');
};
$('add-item').onclick = () => itemRow();
$('refresh').onclick = render;
$('print').onclick = () => (isImport() ? importPrint() : doPrint());
$('scan').onclick = doScan;
$('zoom').onchange = applyZoom; // rescale only, never re-render the page
for (const id of ['paper', 'bclayout', 'cutline']) $(id).onchange = render;
$('rawtext').oninput = schedulePreview;
$('pdf').onchange = preview;
$('imgfile').onchange = () => {
  const f = $('imgfile').files[0];
  $('dropname').textContent = f ? f.name + ' · ' + Math.round(f.size / 1024) + ' KB' : '';
  importPreview();
};
for (const id of ['imp-dpi', 'imp-margin', 'imp-bottom', 'imp-threshold', 'imp-dither', 'imp-trim', 'imp-invert']) {
  $(id).onchange = importPreview;
}
for (const id of document.querySelectorAll('#pane-form input, #pane-form textarea')) {
  id.oninput = schedulePreview;
}
for (const id of document.querySelectorAll('.item-row input')) id.oninput = schedulePreview;

// Click or drag a PDF/PNG onto the drop zone. Keeping the real <input type=file>
// hidden means the browser still handles picking, picking again, and drag order.
const drop = $('drop');
drop.onclick = () => $('imgfile').click();
drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('imgfile').click(); } };
for (const ev of ['dragenter', 'dragover']) {
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
}
for (const ev of ['dragleave', 'drop']) {
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
}
drop.addEventListener('drop', (e) => {
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) $('imgfile').files = e.dataTransfer.files;
  $('imgfile').onchange();
});

$('scan-close').onclick = () => $('scandlg').close();
$('scan-done').onclick = () => $('scandlg').close();
$('scan-again').onclick = doScan;

itemRow();
loadPrinters();
$('rawtext').value = SAMPLE;
showSource();
showEmpty('Pilih file PDF atau PNG', 'Kotak di panel kiri menerima file, atau seret langsung ke sana.');
say('Pilih file PDF atau PNG untuk melihat pratinjau.', 'busy');
</script>
</body>
</html>`;
}
