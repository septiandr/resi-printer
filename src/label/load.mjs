import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createLabel } from './model.mjs';
import { parsePdfLabel, parseTextLabel, parseObjectLabel } from './parse.mjs';

/** Load a label from a JSON file. */
export async function fromJsonFile(file) {
  const raw = await readFile(file, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${err.message}`);
  }
  const list = Array.isArray(data) ? data : Array.isArray(data.labels) ? data.labels : [data];
  return list.map((entry, i) => parseObjectLabel(entry, list.length > 1 ? `${file}#${i + 1}` : file));
}

/** Route by file extension. */
export async function fromFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.json') return fromJsonFile(file);
  if (ext === '.pdf') return [await parsePdfLabel(file)];
  if (ext === '.txt' || ext === '.text') {
    return [parseTextLabel(await readFile(file, 'utf8'))];
  }
  if (ext === '.escpos' || ext === '.bin') {
    throw new Error(`${file} is raw ESC/POS; use "resi raw" to send it`);
  }
  throw new Error(`Unsupported input: ${file} (use .pdf, .json or .txt)`);
}

export { createLabel };
