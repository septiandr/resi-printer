/**
 * Paper geometry.
 *
 * `dots` is the safe printable width, not the full paper width: 58mm and 80mm
 * ESC/POS heads are conventionally 384 and 576 dots, which leaves an
 * unprintable margin on each side of the roll.
 *
 * Measured on the RPP02N with an 80mm roll loaded (`resi import --probe-width`):
 * dots up to at least 576 print, and a 640-dot raster still reaches close to the
 * right edge of the paper. 576 is used because the last few dots of a wider
 * raster get clipped.
 *
 * The vertical layout of a label is driven by the printer's own 24-dot line
 * cell rather than the original sheet's aspect ratio - see src/render/plan.mjs.
 */
export const PAPER = {
  58: { name: '58mm', dots: 384, printableMm: 48, columns: 64 },
  80: { name: '80mm', dots: 576, printableMm: 72, columns: 96 },
};

export default PAPER;
