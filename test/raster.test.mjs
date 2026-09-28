import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync, inflateSync } from 'node:zlib';

import { decodePng, encodePng } from '../src/render/png.mjs';
import {
  prepareBitmap,
  thresholdGray,
  scaleGray,
  padToWidth,
  trimWhite,
  bitmapToGray,
  bitmapToEscPos,
  edgePixelsForDpi,
} from '../src/render/raster.mjs';

/** Build a grayscale image from a tiny ASCII sketch: '#' ink, anything else paper. */
function sketch(rows) {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const gray = new Uint8Array(width * height).fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === '#') gray[y * width + x] = 0;
    }
  }
  return { width, height, gray };
}

function ink(image) {
  let n = 0;
  for (const v of image.gray) if (v < 128) n++;
  return n;
}

function rasterInk(bitmap) {
  let n = 0;
  for (const v of bitmap.data) if (v) n++;
  return n;
}

test('encodePng round-trips greyscale through the real zlib', () => {
  const width = 7;
  const height = 5;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = (i * 37) & 0xff;

  const decoded = decodePng(encodePng({ width, height, gray }));
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
  assert.deepEqual([...decoded.gray], [...gray]);
});

test('encodePng refuses a buffer that does not match the dimensions', () => {
  assert.throws(() => encodePng({ width: 4, height: 4, gray: new Uint8Array(9) }), /size/);
  assert.throws(() => encodePng({ width: 4, height: 4 }), /gray/);
});

test('encodePng emits a decodable stream even for a single row', () => {
  const decoded = decodePng(encodePng({ width: 3, height: 1, gray: Uint8Array.from([0, 128, 255]) }));
  assert.deepEqual([...decoded.gray], [0, 128, 255]);
});

test('decodePng rejects things that are not PNG', () => {
  assert.throws(() => decodePng(Buffer.from('not a png at all')), /PNG/);
  assert.throws(() => decodePng(Buffer.alloc(0)), /PNG/);
});

test('thresholdGray burns darker than the level and leaves the rest as paper', () => {
  const out = thresholdGray(Uint8Array.from([0, 127, 128, 255]), {
    width: 4,
    height: 1,
    level: 128,
  });
  assert.deepEqual([...out.data], [1, 1, 0, 0]);
});

test('thresholdGray inverts which side of the level burns', () => {
  const out = thresholdGray(Uint8Array.from([0, 255]), { width: 2, height: 1, level: 128, invert: true });
  assert.deepEqual([...out.data], [0, 1]);
});

test('thresholdGray dithering puts some ink in a light grey area', () => {
  const flat = new Uint8Array(64 * 4).fill(140);
  const plain = thresholdGray(flat, { width: 64, height: 4, level: 128 });
  const dithered = thresholdGray(flat, { width: 64, height: 4, level: 128, dither: true });
  assert.equal(rasterInk(plain), 0, 'a uniform light grey is blank without dithering');
  assert.ok(rasterInk(dithered) > 0, 'dithering recovers a tone');
});

test('scaleGray keeps the aspect ratio when setting a width', () => {
  const image = sketch(['#', '##', '###']);
  const scaled = scaleGray(image, 6);
  assert.equal(scaled.width, 6);
  assert.equal(scaled.height, 6, '3x2 grows to 6x4 by rounding to 4, not 6');
});

test('scaleGray is a no-op when the width already matches', () => {
  const image = sketch(['#', '.']);
  assert.equal(image.width, 1);
  assert.deepEqual([...scaleGray(image, 1).gray], [...image.gray]);
});

test('scaleGray averages a block down instead of sampling one pixel', () => {
  // One dark column out of four: a naive sample can lose it entirely.
  const gray = new Uint8Array(8 * 1).fill(255);
  gray[1] = 0;
  const scaled = scaleGray({ width: 8, height: 1, gray }, 2);
  assert.ok(scaled.gray[0] < 255, 'the faint bar darkens its dot rather than vanishing');
});

test('padToWidth centres a narrow image on the head', () => {
  const padded = padToWidth({ width: 2, height: 1, gray: Uint8Array.from([0, 0]) }, 6);
  assert.equal(padded.width, 6);
  assert.deepEqual([...padded.gray], [255, 255, 0, 0, 255, 255]);
});

test('padToWidth centres a one dot column in the middle of the head', () => {
  const padded = padToWidth({ width: 1, height: 3, gray: Uint8Array.from([0, 0, 0]) }, 5);
  assert.equal(padded.height, 3, 'the row count never changes');
  assert.deepEqual([...padded.gray], [
    255, 255, 0, 255, 255,
    255, 255, 0, 255, 255,
    255, 255, 0, 255, 255,
  ]);
});

test('trimWhite crops to the ink and can keep a margin', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push('..........');
  rows.splice(3, 3, '..#####...', '..#####...', '..#####...');

  const cropped = trimWhite(sketch(rows), { margin: 0 });
  assert.equal(cropped.width, 5);
  assert.equal(cropped.height, 3);
  assert.equal(ink(cropped), 15);

  const padded = trimWhite(sketch(rows), { margin: 2 });
  assert.equal(padded.width, 9);
  assert.equal(padded.height, 7);
});

test('trimWhite leaves a blank image alone', () => {
  const blank = { width: 6, height: 4, gray: new Uint8Array(24).fill(255) };
  const out = trimWhite(blank);
  assert.equal(out.width, 6);
  assert.equal(out.height, 4);
});

test('trimWhite steps over a solid band welded to the page edge', () => {
  // A renderer can leave a fully black band at the page edge; it is an artefact,
  // so the crop should look past it instead of anchoring to it.
  const rows = ['##########', '..#####...', '##########'];
  const out = trimWhite(sketch(rows));
  assert.equal(out.height, 1, 'the black edge rows are not treated as artwork');
  assert.equal(ink(out), 5, 'the surviving row is the one that has the bar');
});

test('trimWhite keeps a black header that is more than the skip allowance', () => {
  // A 40 row solid block inside a 100 row page is artwork, not an edge
  // artefact, so the crop must not swallow it.
  const rows = [];
  for (let y = 0; y < 100; y++) rows.push(y >= 30 && y < 70 ? '##########' : '..........');

  const out = trimWhite(sketch(rows), { margin: 0 });
  assert.equal(out.height, 40, 'the whole solid block survives');
  assert.equal(out.width, 10);
  assert.equal(ink(out), 400);
});

test('prepareBitmap fills the head width and reports a millimetre height', () => {
  const rows = [];
  for (let y = 0; y < 20; y++) rows.push('####.####');
  const prepared = prepareBitmap(sketch(rows), { dots: 576, trim: true });

  assert.equal(prepared.width, 576, 'the print head width is always filled');
  assert.ok(prepared.height > 0);
  assert.equal(prepared.heightMM, Math.round(prepared.height * 0.125));
});

test('prepareBitmap can leave the original page size when trimming is off', () => {
  const rows = [];
  for (let y = 0; y < 10; y++) rows.push('....##....');
  const prepared = prepareBitmap(sketch(rows), { dots: 576, trim: false, margin: 0 });
  assert.equal(prepared.width, 576);
  assert.ok(rasterInk(prepared) < prepared.data.length / 4, 'most of an untrimmed page stays paper');
});

test('prepareBitmap never overflows a 58mm head', () => {
  const rows = [];
  for (let y = 0; y < 30; y++) rows.push('#'.repeat(40));
  const prepared = prepareBitmap(sketch(rows), { dots: 384 });
  assert.equal(prepared.width, 384);
});

test('prepareBitmap respects maxHeight by fitting the image inside', () => {
  const rows = [];
  for (let y = 0; y < 200; y++) rows.push('#'.repeat(10));
  const prepared = prepareBitmap(sketch(rows), { dots: 576, maxHeight: 100 });
  assert.ok(prepared.height <= 100, `height ${prepared.height} should fit the cap`);
  assert.ok(prepared.width <= 576);
});

test('bitmapToGray shows burnt dots black and paper white', () => {
  const gray = bitmapToGray({ width: 3, height: 1, data: Uint8Array.from([1, 0, 1]) });
  assert.deepEqual([...gray.gray], [0, 255, 0]);
});

test('bitmapToGray is what the preview encodes, so the preview reads correctly', () => {
  const prepared = prepareBitmap(sketch(['####', '..##', '####']), { dots: 8 });
  const view = bitmapToGray(prepared);
  const decoded = decodePng(encodePng(view));
  assert.equal(decoded.width, view.width);
  assert.deepEqual([...decoded.gray], [...view.gray]);
  assert.ok(ink(decoded) > 0, 'the preview has visible ink');
  assert.ok([...decoded.gray].some((v) => v === 255), 'and visible paper');
});

test('bitmapToEscPos emits one raster band per 128 rows and honours the cut mode', () => {
  const bitmap = { width: 16, height: 200, data: new Uint8Array(16 * 200), heightMM: 25 };
  const cut = bitmapToEscPos(bitmap, { cut: 'partial' });
  const full = bitmapToEscPos(bitmap, { cut: 'full' });
  const plain = bitmapToEscPos(bitmap, { cut: null });

  const bands = (buf) => {
    let n = 0;
    for (let i = 0; i < buf.length - 2; i++) {
      if (buf[i] === 0x1d && buf[i + 1] === 0x76 && buf[i + 2] === 0x30) n++;
    }
    return n;
  };
  const hasBytes = (buf, seq) => {
    for (let i = 0; i + seq.length <= buf.length; i++) {
      if (seq.every((b, k) => buf[i + k] === b)) return true;
    }
    return false;
  };
  const PARTIAL = [0x1d, 0x56, 0x01];
  const FULL = [0x1d, 0x56, 0x00];

  assert.equal(bands(cut), 2, '200 rows come as a full band plus a 72 row band');
  assert.ok(hasBytes(cut, PARTIAL), 'a partial cut is requested');
  assert.ok(hasBytes(full, FULL), 'a full cut uses the other GS V form');
  assert.equal(hasBytes(plain, PARTIAL), false, 'no cut means no cut command');
  assert.equal(hasBytes(plain, FULL), false, 'not even the full cut command');
  assert.equal(bands(plain), 2, 'the bands themselves are unchanged');
});

test('a raster band declares its width in bytes, padded to a byte boundary', () => {
  // 17 dots do not divide by 8, so the command must say 3 bytes and carry 3.
  const bitmap = { width: 17, height: 1, data: new Uint8Array(17) };
  const bytes = bitmapToEscPos(bitmap, { cut: null, lead: 0, feed: 0 });

  // Anchor on the raster command itself: init also contains a GS byte.
  const at = [...bytes].findIndex((_, i) => bytes[i] === 0x1d && bytes[i + 1] === 0x76);
  assert.ok(at >= 0, 'a raster command is present');
  assert.equal(bytes[at + 2], 0x30, 'zero');
  assert.equal(bytes[at + 2], 0x30, 'zero');
  assert.equal(bytes[at + 4], 3, 'xL is the width in bytes, not in dots');
  assert.equal(bytes[at + 5], 0, 'xH');
  assert.equal(bytes[at + 6], 1, 'yL is the band height in rows');
  assert.deepEqual(
    [...bytes.slice(at + 8, at + 11)],
    [0, 0, 0],
    'three bytes carry the one row, and the spare dots in the last byte stay clear'
  );
});

test('a band taller than 128 rows splits without losing a row', () => {
  const width = 8;
  const height = 260;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = i % 2; // a distinct pattern per dot

  const bytes = bitmapToEscPos({ width, height, data }, { cut: null, lead: 0, feed: 0 });

  // Pull every band's declared height back out and add it up.
  let total = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) {
      total += bytes[i + 6] + (bytes[i + 7] << 8);
    }
  }
  assert.equal(total, height, 'every row is printed exactly once');
});

test('edgePixelsForDpi treats a PDF point as 1/72 inch', () => {
  // A4 portrait is 419pt long, so 72dpi is one pixel per point.
  assert.equal(edgePixelsForDpi(419, 72), 419);
  assert.equal(edgePixelsForDpi(419, 144), 838);
  assert.equal(edgePixelsForDpi(419, 300), 1746);
  assert.equal(edgePixelsForDpi(419, 600), 3492);
});

test('edgePixelsForDpi never asks for a canvas the browser cannot build', () => {
  // The old code multiplied by 72/25.4 here and asked for 356,000 pixels.
  assert.equal(edgePixelsForDpi(419, 300, 4000), 1746);
  assert.equal(edgePixelsForDpi(419, 6000, 4000), 4000, 'clamped to the ceiling');
  assert.ok(edgePixelsForDpi(419, 300, 4000) < 32767);
});

test('edgePixelsForDpi keeps a tiny page from asking for nothing', () => {
  assert.equal(edgePixelsForDpi(1, 300), 4);
  assert.equal(edgePixelsForDpi(0, 300), 1);
});

test('bitmapToEscPos gives the label real blank paper below it before cutting', () => {
  // A tear can catch the last row of dots. The margin is sent as blank raster
  // rows, not as a feed command, because paper only moves when the head is
  // driven through data - a feed landing right before the cut gets dropped.
  const bitmap = { width: 8, height: 4, data: new Uint8Array(32) };
  const rasterRows = (buf) => {
    let total = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 0x1d && buf[i + 1] === 0x76 && buf[i + 2] === 0x30) total += buf[i + 6] + (buf[i + 7] << 8);
    }
    return total;
  };
  const feeds = (buf) => {
    const out = [];
    for (let i = 0; i < buf.length - 2; i++) {
      if (buf[i] === 0x1b && buf[i + 1] === 0x4a) out.push(buf[i + 2]);
    }
    return out;
  };

  assert.equal(rasterRows(bitmapToEscPos(bitmap, { cut: null, lead: 0, feed: 40 })), 44);
  assert.equal(rasterRows(bitmapToEscPos(bitmap, { cut: null, lead: 0, feed: 96 })), 100);
  assert.equal(rasterRows(bitmapToEscPos(bitmap, { cut: null, lead: 0, feed: 0 })), 4);
  assert.equal(
    feeds(bitmapToEscPos(bitmap, { cut: 'partial', lead: 24, feed: 96 })).length,
    1,
    'only the leading feed remains, the margin is carried by the raster'
  );
  assert.equal(feeds(bitmapToEscPos(bitmap, { cut: 'partial', lead: 24, feed: 96 })).at(-1), 24);
});

test('the blank paper under a label is sent as blank, not as burnt dots', () => {
  // width 8 packs to one byte per row, so the margin is literally zero bytes
  // and any 1 bit here would print black on the tear-off margin.
  const data = new Uint8Array(8).fill(0xff);
  const bitmap = { width: 8, height: 2, data };
  const bytes = bitmapToEscPos(bitmap, { cut: null, lead: 0, feed: 8 });

  const blank = bytes.slice(bytes.length - 8);
  assert.deepEqual([...blank], new Array(8).fill(0), 'the last eight rows carry no ink');
  assert.deepEqual([...data], new Array(8).fill(0xff), 'and the artwork itself is untouched');
});
