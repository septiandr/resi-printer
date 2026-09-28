import { EscPosBuilder } from '../escpos/builder.mjs';
import { PAPER } from './layout.mjs';

/**
 * Print an imported picture instead of re-drawing the label.
 *
 * A label is reduced to one bit per thermal dot, so everything here is about
 * getting the incoming artwork onto that grid without losing thin strokes or
 * barcode bars:
 *
 *  - scale to the exact dot width of the print head (never stretch to fit a
 *    height, that would distort the artwork)
 *  - box-filter when downscaling, so a bar narrower than a dot still darkens
 *    its dot instead of disappearing
 *  - optional ordered dithering, because Floyd-Steinberg blurs 1-pixel barcode
 *    bars into grey mush
 */

/** Dots of image to send per raster command. */
const BAND = 128;

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Convert grayscale samples to 1 byte per dot: 1 = burn, 0 = paper. */
export function thresholdGray(gray, { width, height, level = 128, dither = false, invert = false }) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const v = gray[i];
      const threshold = dither
        ? level + ((BAYER[y & 3][x & 3] - 7.5) * (255 / 16))
        : level;
      const ink = invert ? v > threshold : v < threshold;
      out[i] = ink ? 1 : 0;
    }
  }
  return { width, height, data: out };
}

/**
 * Scale a grayscale image to an exact width, preserving aspect ratio.
 *
 * Downscaling averages every source pixel that lands on a target pixel, which
 * is what keeps a 0.3mm barcode bar visible on a 0.14mm dot pitch.
 */
export function scaleGray({ width, height, gray }, targetWidth) {
  if (targetWidth === width) return { width, height, gray };

  const targetHeight = Math.max(1, Math.round((height * targetWidth) / width));
  const out = new Uint8Array(targetWidth * targetHeight);
  const xRatio = width / targetWidth;
  const yRatio = height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil((y + 1) * yRatio)));
    for (let x = 0; x < targetWidth; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((x + 1) * xRatio)));
      let sum = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        const row = sy * width;
        for (let sx = x0; sx < x1; sx++) {
          sum += gray[row + sx];
          n++;
        }
      }
      out[y * targetWidth + x] = n ? (sum / n + 0.5) : 255;
    }
  }
  return { width: targetWidth, height: targetHeight, gray: out };
}

/** Centre a scaled image in the print head and pad the sides with paper. */
export function padToWidth({ width, height, gray }, dots) {
  if (width === dots) return { width: dots, height, gray };
  const left = Math.max(0, Math.floor((dots - width) / 2));
  const out = new Uint8Array(dots * height).fill(255);
  for (let y = 0; y < height; y++) {
    out.set(gray.subarray(y * width, y * width + width), y * dots + left);
  }
  return { width: dots, height, gray: out };
}

/**
 * Crop the surrounding white margin.
 *
 * A label exported as A4 is mostly empty paper, and scaling the whole sheet to
 * the print head would shrink the artwork to a fraction of the width. Trimming
 * to the ink is what makes an imported page fill the label.
 *
 * A solid dark band sitting on the page edge is an artefact of the renderer, not
 * artwork, so leading/trailing rows and columns that are almost entirely ink are
 * stepped over instead of anchoring the crop.
 */
export function trimWhite({ width, height, gray }, { threshold = 200, margin = 0, solid = 0.9, density = 0.01 } = {}) {
  const rowInk = new Int32Array(height);
  const colInk = new Int32Array(width);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (gray[row + x] < threshold) {
        rowInk[y]++;
        colInk[x]++;
      }
    }
  }

  const maxSkipY = Math.max(1, Math.floor(height * 0.05));
  const maxSkipX = Math.max(1, Math.floor(width * 0.05));
  const isSolid = (count, span) => count >= span * solid;

  // Artwork rows and columns carry a real share of the line; a lone stray pixel
  // from a render artefact should not stretch the crop.
  const minRow = Math.max(1, width * density);
  const minCol = Math.max(1, height * density);

  let top = 0;
  while (top < height && isSolid(rowInk[top], width) && top < maxSkipY) top++;
  let bottom = height - 1;
  while (bottom > top && isSolid(rowInk[bottom], width) && height - bottom <= maxSkipY) bottom--;
  let left = 0;
  while (left < width && isSolid(colInk[left], height) && left < maxSkipX) left++;
  let right = width - 1;
  while (right > left && isSolid(colInk[right], height) && width - right <= maxSkipX) right--;

  // Pull the box in to the first and last row/column that actually hold artwork.
  while (top <= bottom && rowInk[top] < minRow) top++;
  while (bottom >= top && rowInk[bottom] < minRow) bottom--;
  while (left <= right && colInk[left] < minCol) left++;
  while (right >= left && colInk[right] < minCol) right--;
  if (bottom < top || right < left) return { width, height, gray }; // nothing to trim

  const pad = Math.max(0, margin);
  const x0 = Math.max(0, left - pad);
  const y0 = Math.max(0, top - pad);
  const x1 = Math.min(width, right + 1 + pad);
  const y1 = Math.min(height, bottom + 1 + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    out.set(gray.subarray((y0 + y) * width + x0, (y0 + y) * width + x1), y * w);
  }
  return { width: w, height: h, gray: out };
}

/**
 * A scaled, dithered bitmap ready for the head.
 *
 * The image is trimmed to its ink, scaled to the head's dot width, and its
 * aspect ratio is kept. If `maxHeight` is set and the result would be taller,
 * the image is instead scaled to fit inside dots x maxHeight and centred.
 */
export function prepareBitmap(
  grayImage,
  { dots, threshold = 128, dither = false, invert = false, maxHeight = 0, trim = true, margin = 0 },
) {
  const source = trim ? trimWhite(grayImage, { margin }) : grayImage;
  const image = maxHeight ? fitInside(source, dots, maxHeight) : scaleGray(source, dots);
  const padded = padToWidth(image, dots);
  const bitmap = thresholdGray(padded.gray, {
    width: padded.width,
    height: padded.height,
    level: threshold,
    dither,
    invert,
  });
  return { ...bitmap, heightMM: Math.round(bitmap.height * 0.125) };
}

/** Largest version of the image that fits inside dots x maxHeight. */
function fitInside(grayImage, dots, maxHeight) {
  const scaledToWidth = scaleGray(grayImage, dots);
  if (scaledToWidth.height <= maxHeight) return scaledToWidth;
  const targetWidth = Math.max(1, Math.floor((grayImage.width * maxHeight) / grayImage.height));
  return scaleGray(grayImage, targetWidth);
}

/**
 * Longest edge, in pixels, for a page rendered at a given resolution.
 *
 * A PDF page is measured in points, 72 to the inch, so pixels = points * dpi / 72.
 * Getting this wrong by a factor of 25.4/72 asks for a canvas tens of thousands
 * of pixels wide, which the browser silently refuses.
 */
export function edgePixelsForDpi(longPt, dpi, max = 4000) {
  return Math.max(1, Math.min(max, Math.round((longPt * dpi) / 72)));
}

/** Expand a 1-bit bitmap to viewable greyscale: burnt dot black, paper white. */
export function bitmapToGray(bitmap) {
  const gray = new Uint8Array(bitmap.width * bitmap.height);
  for (let i = 0; i < gray.length; i++) gray[i] = bitmap.data[i] ? 0 : 255;
  return { width: bitmap.width, height: bitmap.height, gray };
}

/**
 * The same bitmap with `rows` blank rows under it.
 *
 * Paper only advances when the head is driven through raster data, so blank
 * rows are the one way to guarantee a measured amount of paper below a label. A
 * feed command that lands right before the cut is firmware the printer is free
 * to drop, and a margin that can vanish is not a margin.
 */
export function appendBlankRows(bitmap, rows) {
  const n = Math.max(0, Math.round(Number(rows) || 0));
  if (!n) return bitmap;
  const height = bitmap.height + n;
  const data = new Uint8Array(bitmap.data.length + bitmap.width * n);
  data.set(bitmap.data, 0);
  return {
    ...bitmap,
    height,
    data,
    ...(bitmap.heightMM === undefined ? {} : { heightMM: Math.round(height * 0.125) }),
  };
}

/**
 * Emit the bitmap as GS v 0 raster bands, with `feed` dots of blank paper
 * under the label so a tear cannot chew the last row of dots.
 */
export function bitmapToEscPos(bitmap, { cut = 'partial', feed = 40, lead = 24, band = BAND } = {}) {
  const printable = appendBlankRows(bitmap, feed);
  const b = new EscPosBuilder();
  b.init().align('left');
  b.feedDots(lead);

  for (let y = 0; y < printable.height; y += band) {
    const rows = Math.min(band, printable.height - y);
    b.raster(
      {
        width: printable.width,
        height: rows,
        data: printable.data.subarray(y * printable.width, (y + rows) * printable.width),
      },
      0,
    );
  }

  if (cut === 'full') b.cut('full');
  else if (cut === 'partial') b.cut('partial');
  return b.build();
}

export { PAPER };
