import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
const CONFIG_DIR = path.join(ROOT, 'profiles');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  paper: 80,
  device: null,
  codePage: 0,
  cut: 'partial',
  qr: true,
  moduleWidth: 2,
  trailingLines: 3,
  chunkSize: 180,
  chunkDelayMs: 18,
};

export async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveConfig(config) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
}

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'device';

export async function saveProfile(name, profile) {
  await mkdir(CONFIG_DIR, { recursive: true });
  const file = path.join(CONFIG_DIR, `${slug(name)}.json`);
  await writeFile(file, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  return file;
}

export async function loadProfile(name) {
  const file = path.join(CONFIG_DIR, `${slug(name)}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function listProfiles() {
  try {
    const files = await readdir(CONFIG_DIR);
    return files.filter((f) => f.endsWith('.json') && f !== 'config.json').map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

export { DEFAULTS, slug };
