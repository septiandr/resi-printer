import noble from '@stoprocent/noble';

/**
 * Bluetooth Low Energy access on macOS via CoreBluetooth (noble's `mac`
 * binding). No root and no external tools.
 *
 * Note: this cannot reach classic Bluetooth serial ports (SPP). macOS exposes
 * no API for those, so a printer that only offers SPP cannot be driven from
 * here - it needs a BLE module or a network/AirPrint path.
 */
export function isAvailable() {
  return !!noble;
}

export function adapterState() {
  try {
    return noble.state ?? 'unknown';
  } catch {
    return 'unavailable';
  }
}

/**
 * Bring the adapter up. On macOS the CoreBluetooth binding initialises
 * lazily, so `noble.state` reads 'unknown' until this is awaited.
 */
export async function waitForPoweredOn(timeout = 10000) {
  if (noble.state === 'poweredOn') return;
  try {
    await withTimeout(noble.waitForPoweredOnAsync(), timeout);
  } catch (err) {
    throw new Error(
      `Bluetooth is not available (${noble.state}). Turn Bluetooth on, and allow this terminal in ` +
        `System Settings > Privacy & Security > Bluetooth. (${err.message})`
    );
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), ms);
    }),
  ]);
}

/** Release the CoreBluetooth handle so the process can exit. */
export function shutdownNoble() {
  try {
    noble.stop?.();
  } catch { /* already stopped */ }
}

export function normalizeId(id) {
  return String(id ?? '').toLowerCase().replace(/-/g, ':');
}

export function matchesId(peripheral, wanted) {
  if (!wanted) return false;
  const w = normalizeId(wanted);
  if (!w) return false;
  const candidates = [peripheral.id, peripheral.address].map(normalizeId).filter(Boolean);
  return candidates.some((c) => c === w || c.endsWith(w) || w.endsWith(c));
}

export function describePeripheral(peripheral) {
  const adv = peripheral.advertisement ?? {};
  return {
    id: normalizeId(peripheral.id),
    address: normalizeId(peripheral.address),
    name: adv.localName || peripheral.name || '(no name)',
    rssi: peripheral.rssi,
    connectable: peripheral.connectable ?? null,
    addressType: peripheral.addressType,
    serviceUuids: adv.serviceUuids ?? [],
    manufacturerData: adv.manufacturerData ? adv.manufacturerData.toString('hex') : null,
    txPower: adv.txPowerLevel ?? null,
    peripheral,
  };
}

/**
 * Scan for peripherals for `timeout` ms, calling `onFound` as they appear.
 */
export function scan({ timeout = 8000, filter, onFound } = {}) {
  return new Promise((resolve, reject) => {
    const found = new Map();
    let timer;

    const finish = (err) => {
      clearTimeout(timer);
      noble.removeListener?.('discover', onDiscover);
      noble.stopScanningAsync?.().catch(() => {});
      if (err) reject(err);
      else resolve([...found.values()]);
    };

    const onDiscover = (peripheral) => {
      const entry = describePeripheral(peripheral);
      if (filter && !filter(entry)) return;
      if (found.has(entry.id)) return;
      found.set(entry.id, entry);
      onFound?.(entry);
    };

    timer = setTimeout(() => finish(), timeout);
    try {
      noble.on('discover', onDiscover);
      if (noble.state !== 'poweredOn') {
        finish(new Error('Bluetooth adapter is not powered on'));
        return;
      }
      noble.startScanningAsync([], false).catch((err) => finish(err));
    } catch (err) {
      finish(err);
    }
  });
}

/** Scan for one specific peripheral and hand it back. */
export async function findPeripheral(id, timeout = 10000) {
  const found = await scan({ timeout, filter: (d) => matchesId(d.peripheral, id) });
  return found[0]?.peripheral ?? null;
}

/** Scan for a peripheral by advertised name, e.g. "RPP02N". */
export async function findPeripheralByName(name, timeout = 10000) {
  const needle = String(name).toLowerCase();
  const found = await scan({ timeout, filter: (d) => d.name.toLowerCase() === needle });
  const loose = found[0] ?? (await scan({ timeout: 2000, filter: (d) => d.name.toLowerCase().includes(needle) }))[0];
  return loose?.peripheral ?? null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
