import { ESC, GS } from './builder.mjs';

// GS k function codes (format B: GS k m n d1..dn).
const GS_K = {
  UPC_A: 65,
  UPC_E: 66,
  CODE39: 67,
  CODE93: 68,
  CODE128: 69,
  EAN8: 70,
  EAN13: 71,
  ITF: 72,
  CODABAR: 73,
  CODE39_EXT: 74,
};

const HRI = { off: 0, above: 1, below: 2, both: 3 };

/**
 * Number of modules a CODE128 symbol will occupy, used to pick a module width.
 * Delegates to the real encoder so the fit calculation can never disagree with
 * what actually gets drawn.
 */
export function code128ModuleCount(text) {
  return code128Pattern(text).modules;
}

/**
 * Emit a 1D barcode using the printer's own symbology engine.
 * `moduleWidth` is in printer units (2..6, where 2 is the narrowest most
 * firmware accepts).
 */
export function barcode(builder, type, data, { hri = 'off', moduleWidth = 2 } = {}) {
  const fn = GS_K[type];
  if (!fn) throw new Error(`Unsupported barcode type: ${type}`);
  if (data == null || data === '') throw new Error(`Barcode ${type}: empty data`);

  const payload = new TextEncoder().encode(String(data));
  if (payload.length > 255) throw new Error(`Barcode ${type}: data longer than 255 bytes`);

  builder.raw([GS, 0x68, HRI[hri] ?? 0]); // HRI off/on
  builder.raw([GS, 0x77, Math.max(1, Math.min(6, moduleWidth))]); // module width
  builder.raw([GS, 0x6b, fn, payload.length]);
  builder.raw(payload);
  return builder;
}

/** Convenience: CODE128, the symbology Shopee Express uses on resi labels. */
export function code128(builder, data, options) {
  return barcode(builder, 'CODE128', data, options);
}

/** CODE39, for hardware that mis-handles CODE128. */
export function code39(builder, data, options) {
  return barcode(builder, 'CODE39', data, options);
}

// ---------------------------------------------------------------------------
// Software CODE128 encoder
//
// The printer's own symbology engine (GS k) cannot be placed at an exact dot
// position or height, so for pixel-exact labels we encode the symbol ourselves
// and rasterise it onto the page. The table below is the standard set of 107
// patterns; each entry lists the six element widths of a symbol character.
// ---------------------------------------------------------------------------

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const CODE_B = 104;
const CODE_C = 105;
const STOP = 106;

const isDigit = (ch) => ch >= '0' && ch <= '9';

/**
 * Pick the cheapest code set for `text` and return the ordered list of symbol
 * values, excluding the start character and checksum.
 */
function planSymbols(text) {
  const values = [];
  let i = 0;
  // Leading digits can use code C straight away.
  if (text.length >= 2 && isDigit(text[0]) && isDigit(text[1])) {
    values.push({ set: 'C', value: Number(text.slice(0, 2)) });
    i = 2;
    while (i + 1 < text.length && isDigit(text[i]) && isDigit(text[i + 1])) {
      values.push({ set: 'C', value: Number(text.slice(i, i + 2)) });
      i += 2;
    }
  }
  for (; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code > 126) {
      throw new Error(`CODE128: character out of range at ${i}: ${JSON.stringify(text[i])}`);
    }
    values.push({ set: 'B', value: code - 32 });
  }
  return values;
}

/** Re-encode as code C wherever a run of 6+ digits appears, to shorten the symbol. */
function optimiseRuns(values) {
  const out = [];
  let i = 0;
  while (i < values.length) {
    if (values[i].set === 'B' && values[i].value >= 16) {
      // value 16..25 are the digits '0'..'9' in code B
      let digits = 0;
      while (
        i + digits < values.length &&
        values[i + digits].set === 'B' &&
        values[i + digits].value >= 16 &&
        values[i + digits].value <= 25
      ) {
        digits++;
      }
      if (digits >= 6) {
        const even = digits - (digits % 2);
        for (let k = 0; k < even; k += 2) {
          out.push({ set: 'C', value: (values[i + k].value - 16) * 10 + (values[i + k + 1].value - 16) });
        }
        i += even;
        if (digits % 2) out.push(values[i++]);
        continue;
      }
    }
    out.push(values[i++]);
  }
  return out;
}

/**
 * Encode `text` as CODE128 and return the module geometry.
 *
 * @returns {{modules:number, elements:Array<[number, boolean]>, quiet:number}}
 *   `elements` is a run-length list of [moduleCount, isBar] starting with a bar.
 */
export function code128Pattern(text) {
  const src = String(text);
  if (!src) throw new Error('CODE128: empty data');

  const planned = planSymbols(src);
  const values = optimiseRuns(planned);

  // Determine the start set, and emit switch characters as needed.
  const symbols = [];
  let current = null;
  for (const v of values) {
    if (v.set !== current) {
      if (current === null) {
        symbols.push(v.set === 'C' ? CODE_C : CODE_B);
        current = v.set;
      } else {
        // Code A/B -> C is 99, -> B is 100; C -> B is 100, -> A is 101.
        symbols.push(current === 'B' ? 99 : 100);
        current = v.set;
      }
    }
    symbols.push(v.value);
  }

  let sum = symbols[0];
  for (let i = 1; i < symbols.length; i++) sum += symbols[i] * i;
  const checksum = sum % 103;

  const codes = [...symbols, checksum, STOP];
  const elements = [];
  let modules = 0;
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) throw new Error(`CODE128: no pattern for value ${code}`);
    for (let k = 0; k < pattern.length; k++) {
      const width = Number(pattern[k]);
      elements.push([width, k % 2 === 0]);
      modules += width;
    }
  }

  return { modules, elements, quiet: 10 };
}

export { ESC, GS };
