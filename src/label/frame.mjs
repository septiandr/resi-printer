/**
 * Geometry of the real Shopee Express label, recovered from assets/resi.pdf.
 *
 * The label is a ~100 x 80 mm shipping label (aspect 1.229) and every position
 * below is *normalised* to that box (0..1, y downwards) so it can be scaled to
 * any paper width.
 *
 * Two coordinate frames live in the PDF: the text layer and the vector layer
 * (the stroked boxes) are in different user spaces, so positions here are
 * derived from the text layer, which is internally consistent, and the boxes
 * are fitted around the text groups they enclose. The arrangement - a tall
 * receiver box on the left, two short boxes across the top right, a small
 * weight box, a thin ship-by box and three barcode cells along the bottom -
 * is taken from the vector layer.
 *
 * x is normalised against the 419pt text width, y against the 382pt text height.
 */
export const LABEL_ASPECT = 401.8 / 327.0;

/** Outer border of the label. */
export const BORDER = [0.02, 0.0, 0.96, 1.0];

/** Horizontal position of each of the three barcode cells, plus their width. */

/** The three boxed barcode cells along the bottom of the label. */
export const BOTTOM_BOXES = [
  [0.021, 0.94, 0.315, 0.06],
  [0.345, 0.94, 0.315, 0.06],
  [0.669, 0.94, 0.315, 0.06],
];

/**
 * Rows of the label, as [y, ...] anchors taken from the PDF text layer.
 * `y` is the top of the text baseline band.
 */
export const ROWS = {
  topBarcode: 0.004,
  topHri: 0.07,
  service: 0.082,
  resiLabel: 0.16,
  routeCode: 0.178,
  tracking: 0.186,
  labelRef: 0.252,
  parties: 0.378,
  partiesLine2: 0.412,
  address: 0.448,
  addressStep: 0.022,
  locality: 0.524,
  district: 0.574,
  weight: 0.629,
  shipBy: 0.67,
  order: 0.716,
  tableHeader: 0.858,
  tableRule: 0.874,
  tableRow: 0.882,
  tableStep: 0.02,
  orderCaption: 0.924,
  bottomBarcode: 0.94,
  bottomHri: 0.984,
};

/** Column anchors, normalised x. */
export const COLS = {
  pageLeft: 0.014,
  receiver: 0.026,
  receiverValue: 0.126,
  receiverBoxRight: 0.29,
  sender: 0.604,
  senderValue: 0.73,
  routeCode: 0.365,
  service: 0.444,
  resi: 0.69,
  labelRef: 0.086,
  weight: 0.033,
  weightValue: 0.122,
  cod: 0.546,
  codValue: 0.702,
  tableHash: 0.014,
  tableName: 0.064,
  tableSku: 0.546,
  tableVariation: 0.718,
  tableQty: 0.921,
  pageRight: 0.986,
};

/** Boxes fitted around the text groups they enclose. */
export const BOXES = [
  // tall receiver address box on the left
  [0.02, 0.372, 0.27, 0.22],
  // route code block, top middle
  [0.286, 0.168, 0.348, 0.05],
  // "Resi" block, top right
  [0.64, 0.168, 0.35, 0.05],
  // weight / COD
  [0.02, 0.618, 0.14, 0.032],
  // ship-by date
  [0.031, 0.66, 0.261, 0.03],
  // the three bottom barcode cells
  ...BOTTOM_BOXES,
];

/** Scale a normalised rect onto a paper of `dots` printable width. */
export function scaleRect(rect, dots, height) {
  const [x, y, w, h] = rect;
  return {
    x: Math.round(x * dots),
    y: Math.round(y * height),
    w: Math.round(w * dots),
    h: Math.round(h * height),
  };
}

/** Total label height in dots for a given printable width, honouring the aspect. */
export function labelHeight(dots) {
  return Math.round(dots / LABEL_ASPECT);
}
