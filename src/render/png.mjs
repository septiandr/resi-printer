import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Minimal PNG decoder, enough for label artwork: non-interlaced 8-bit
 * grayscale / RGB / RGBA / palette images, which is what screenshots and
 * exported labels actually are. Keeping this in-tree means importing a file
 * needs no native canvas module.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Reverse the per-scanline PNG filters, in place, into a flat sample buffer. */
function unfilter(raw, { width, height, bytesPerPixel, bytesPerRow }) {
  const out = Buffer.alloc(height * bytesPerRow);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const rowStart = y * bytesPerRow;
    const prevStart = rowStart - bytesPerRow;
    for (let x = 0; x < bytesPerRow; x++) {
      const value = raw[pos + x];
      const a = x >= bytesPerPixel ? out[rowStart + x - bytesPerPixel] : 0;
      const b = y > 0 ? out[prevStart + x] : 0;
      const c = y > 0 && x >= bytesPerPixel ? out[prevStart + x - bytesPerPixel] : 0;
      let restored;
      switch (filter) {
        case 0: restored = value; break;
        case 1: restored = value + a; break;
        case 2: restored = value + b; break;
        case 3: restored = value + ((a + b) >> 1); break;
        case 4: restored = value + paeth(a, b, c); break;
        default:
          throw new Error(`PNG: unknown filter ${filter} on row ${y}`);
      }
      out[rowStart + x] = restored & 0xff;
    }
    pos += bytesPerRow;
  }
  return out;
}

/**
 * Decode a PNG into 8-bit grayscale samples.
 * Returns { width, height, gray } where gray is 0 (black) .. 255 (white).
 */
export function decodePng(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');

  let pos = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (pos + 8 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length; // length + type + data + crc

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      transparency = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!header) throw new Error('PNG: missing IHDR');
  if (header.interlace) throw new Error('PNG: interlaced images are not supported');
  if (header.compression !== 0 || header.filter !== 0) throw new Error('PNG: unsupported compression');
  if (![1, 2, 4, 8, 16].includes(header.depth)) throw new Error(`PNG: bad bit depth ${header.depth}`);

  const { width, height, depth, colorType } = header;
  if (!width || !height) throw new Error('PNG: zero size');

  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`PNG: unsupported colour type ${colorType}`);
  if (colorType === 3 && !palette) throw new Error('PNG: palette image without PLTE');

  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerRow = Math.ceil((width * channels * depth) / 8);
  if (raw.length < height * (bytesPerRow + 1)) throw new Error('PNG: truncated image data');

  const samples = unfilter(raw, { width, height, bytesPerPixel: Math.max(1, (channels * depth) / 8), bytesPerRow });
  const gray = new Uint8Array(width * height);
  const maxValue = (1 << depth) - 1;

  // Read one source sample, scaled to 0..255.
  const sample = (rowStart, index) => {
    if (depth === 8) return samples[rowStart + index];
    if (depth === 16) return samples[rowStart + index * 2]; // take the high byte
    const bitPos = index * depth;
    const byte = samples[rowStart + (bitPos >> 3)];
    const shift = 8 - depth - (bitPos & 7);
    return ((byte >> shift) & maxValue) * (255 / maxValue);
  };

  for (let y = 0; y < height; y++) {
    const rowStart = y * bytesPerRow;
    for (let x = 0; x < width; x++) {
      let value;
      switch (colorType) {
        case 0:
        case 4:
          value = sample(rowStart, x);
          break;
        case 2:
        case 6: {
          const base = x * channels;
          const r = sample(rowStart, base);
          const g = sample(rowStart, base + 1);
          const b = sample(rowStart, base + 2);
          value = 0.299 * r + 0.587 * g + 0.114 * b;
          break;
        }
        default: {
          const index = Math.round(sample(rowStart, x));
          const r = palette[index * 3] ?? 0;
          const g = palette[index * 3 + 1] ?? 0;
          const b = palette[index * 3 + 2] ?? 0;
          value = 0.299 * r + 0.587 * g + 0.114 * b;
          if (transparency && index < transparency.length && transparency[index] === 0) value = 255;
          break;
        }
      }
      gray[y * width + x] = value < 0 ? 0 : value > 255 ? 255 : value;
    }
  }

  return { width, height, gray };
}

/** CRC-32, as PNG chunks require. */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}

/**
 * Encode 8-bit grayscale samples as a PNG.
 *
 * Used to send the exact one-bit result back to the browser, so the preview is
 * the dots that will be burnt rather than a re-render of the source.
 */
export function encodePng({ width, height, gray }) {
  if (!gray) throw new Error('encodePng needs a gray buffer');
  if (gray.length !== width * height) throw new Error('encodePng buffer size does not match width/height');
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      raw[y * (width + 1) + 1 + x] = gray[y * width + x] & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
