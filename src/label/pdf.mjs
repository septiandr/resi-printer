/**
 * PDF text extraction that preserves coordinates. The Shopee Express label is
 * a two column layout (receiver on the left, sender on the right), so the
 * flattened text stream is ambiguous - we need x/y to split the blocks.
 */
export async function extractBoxes(pdfPath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { readFile } = await import('node:fs/promises');

  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;

  const pages = [];
  const pageCount = doc.numPages ?? doc.pageCount ?? 0;
  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const boxes = [];
    for (const item of content.items) {
      if (typeof item.str !== 'string') continue;
      const text = item.str.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const t = item.transform;
      const x = t[4];
      const y = t[5];
      const size = item.height || Math.hypot(t[1], t[3]) || Math.abs(t[0]) || 10;
      boxes.push({ text, x, y, size, width: item.width ?? text.length * size * 0.5, page: p });
    }
    pages.push({ width: viewport.width, height: viewport.height, boxes });
  }
  await doc.destroy();
  return pages;
}

/** Group boxes into visual lines by vertical position, ordered top to bottom. */
export function groupLines(boxes, tolerance = 0.55) {
  const sorted = [...boxes].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const box of sorted) {
    const tol = box.size * tolerance;
    const line = lines.find((l) => Math.abs(l.y - box.y) <= Math.max(tol, l.tol));
    if (line) {
      line.boxes.push(box);
      line.y = (line.y * (line.boxes.length - 1) + box.y) / line.boxes.length;
      line.tol = Math.max(tol, line.tol);
    } else {
      lines.push({ y: box.y, tol, boxes: [box] });
    }
  }
  for (const line of lines) {
    line.boxes.sort((a, b) => a.x - b.x);
    line.items = line.boxes.map((b) => ({ ...b }));
    line.text = joinLine(line.boxes);
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map((l, i) => ({ index: i, y: l.y, text: l.text, items: l.items }));
}

function joinLine(boxes) {
  let out = '';
  let prevEnd = null;
  for (const box of boxes) {
    if (prevEnd !== null) {
      const gap = box.x - prevEnd;
      if (gap > box.size * 0.28) out += '  ';
      else if (gap > box.size * 0.08) out += ' ';
    }
    out += box.text;
    prevEnd = box.x + (box.width ?? 0);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Split boxes into vertical bands. `anchors` is a list of
 * { x, width } and each box is assigned to the closest anchor band.
 */
export function splitColumns(boxes, anchors) {
  const bands = anchors.map((a, i) => ({ ...a, index: i, items: [] }));
  for (const box of boxes) {
    let best = bands[0];
    let bestDist = Infinity;
    for (const band of bands) {
      const center = band.x + band.width / 2;
      const dist = Math.abs(box.x + (box.width ?? 0) / 2 - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = band;
      }
    }
    best.items.push(box);
  }
  for (const band of bands) band.lines = groupLines(band.items);
  return bands;
}

/** Plain text dump, useful for `resi pdf --dump`. */
export function toPlainText(pages) {
  return pages
    .map((page, i) => `--- page ${i + 1} (${Math.round(page.width)}x${Math.round(page.height)}) ---\n${groupLines(page.boxes).map((l) => l.text).join('\n')}`)
    .join('\n\n');
}
