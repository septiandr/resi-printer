import noble from '@stoprocent/noble';
import {
  describePeripheral,
  findPeripheral,
  findPeripheralByName,
  matchesId,
  normalizeId,
  sleep,
  waitForPoweredOn,
} from './scan.mjs';

/**
 * Connect to a thermal printer and push ESC/POS bytes at it.
 *
 * BLE writes are chunked to the negotiated MTU. Most cheap printers expose no
 * flow-control characteristic, so writes are paced and flushed with a settle
 * delay before the link is dropped.
 */
export class PrinterConnection {
  constructor(peripheral) {
    this.peripheral = peripheral;
    this.services = [];
    this.characteristics = new Map();
    this.chunkSize = 180;
    this.chunkDelayMs = 18;
    this.mtu = null;
  }

  static async connect(id, { timeout = 15000 } = {}) {
    await waitForPoweredOn();
    // macOS reports a CoreBluetooth UUID rather than a MAC address, and that
    // UUID can change when the Bluetooth cache is reset - so also accept a
    // printer name and look it up over the air.
    let peripheral = await findPeripheral(id, Math.min(timeout, 10000));
    if (!peripheral && !isUuidLike(id)) {
      peripheral = await findPeripheralByName(id, Math.min(timeout, 10000));
    }
    if (!peripheral) throw new Error(`Peripheral not found: ${id}`);

    const entry = describePeripheral(peripheral);
    if (entry.connectable === false) {
      throw new Error(`${entry.name} is advertising as non-connectable`);
    }
    await withTimeout(
      peripheral.connectAsync(),
      timeout,
      `Could not connect to ${entry.name || id}. Is it powered on and not already connected to another host?`
    );
    return new PrinterConnection(peripheral);
  }

  get id() {
    return normalizeId(this.peripheral.id);
  }

  get address() {
    return normalizeId(this.peripheral.address);
  }

  get name() {
    return this.peripheral.advertisement?.localName || this.peripheral.name || null;
  }

  /** Discover all services and characteristics, caching them by UUID. */
  async discover() {
    this.characteristics.clear();
    this.services = await this.peripheral.discoverAllServicesAndCharacteristicsAsync();
    for (const service of this.services.services) {
      for (const c of service.characteristics) {
        this.characteristics.set(String(c.uuid).toLowerCase(), {
          uuid: c.uuid,
          name: c.name || null,
          serviceUuid: service.uuid,
          serviceName: service.name || null,
          properties: c.properties,
          characteristic: c,
        });
      }
    }
    if (this.peripheral.mtu) this.mtu = this.peripheral.mtu;
    return this.listCharacteristics();
  }

  listCharacteristics() {
    return [...this.characteristics.values()].map(({ uuid, name, serviceUuid, serviceName, properties }) => ({
      uuid,
      name,
      serviceUuid,
      serviceName,
      properties,
    }));
  }

  /**
   * Choose the characteristic to write print jobs to.
   *
   * Most BLE receipt printers use one of a handful of well known services, so
   * prefer those and fall back to any writable characteristic.
   */
  writeTarget(hintUuid) {
    if (hintUuid) {
      const hit = this.characteristics.get(String(hintUuid).toLowerCase());
      if (hit) return hit;
    }
    const writable = [...this.characteristics.values()].filter(
      (c) => c.properties.includes('write') || c.properties.includes('writeWithoutResponse')
    );
    if (!writable.length) return null;

    const knownService = /^(18f0|1811|1810|ffe0|ffe5|0000ff00|0000ffe0)/i;
    const knownChar = /^(0000ff02|0000ff00|2af1|2af0|fff1|fff2|fff3|0000ffe1|0000ffe2|49535343)/i;

    return (
      writable.find((c) => knownChar.test(c.uuid)) ??
      writable.find((c) => c.properties.includes('write')) ??
      writable.find((c) => knownService.test(c.serviceUuid)) ??
      writable[0]
    );
  }

  async write(data, { target, onProgress } = {}) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!bytes.length) return 0;

    if (!this.characteristics.size) await this.discover();
    const entry = this.writeTarget(target);
    if (!entry) {
      throw new Error(
        'This printer exposes no writable characteristic. It is most likely a classic-Bluetooth ' +
          '(SPP) printer, which macOS cannot drive - it needs a BLE module, or a network/AirPrint route.'
      );
    }

    // Stay under the negotiated MTU payload.
    const maxPayload = this.mtu && this.mtu > 23 ? this.mtu - 3 : 180;
    const size = Math.max(20, Math.min(this.chunkSize, maxPayload));
    const total = Math.ceil(bytes.length / size);
    const withoutResponse = entry.properties.includes('writeWithoutResponse');

    for (let i = 0; i < total; i++) {
      const end = Math.min(bytes.length, (i + 1) * size);
      await entry.characteristic.writeAsync(Buffer.from(bytes.subarray(i * size, end)), withoutResponse);
      onProgress?.(end, bytes.length, total);
      if (i < total - 1) await sleep(this.chunkDelayMs);
    }
    // Let the printer's own buffer drain before we tear the link down.
    await sleep(this.chunkDelayMs * 4 + 200);
    return bytes.length;
  }

  /** Read a characteristic value (e.g. to poll the printer status byte). */
  async read(uuid) {
    const entry = this.characteristics.get(String(uuid).toLowerCase());
    if (!entry) throw new Error(`Unknown characteristic: ${uuid}`);
    const data = await entry.characteristic.readAsync();
    return { hex: data.toString('hex'), text: data.toString('ascii').replace(/[^\x20-\x7e]/g, '.') };
  }

  async disconnect() {
    try {
      if (this.peripheral.state === 'connected') await this.peripheral.disconnectAsync();
    } catch { /* link already down */ }
  }
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;

function isUuidLike(id) {
  return UUID_LIKE.test(String(id ?? '').toLowerCase());
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

export { noble, matchesId, normalizeId, sleep };
