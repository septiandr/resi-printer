import { scan, waitForPoweredOn, adapterState, isAvailable, describePeripheral } from '../ble/scan.mjs';
import { PrinterConnection, sleep } from '../ble/connect.mjs';
import { saveProfile, loadProfile, saveConfig, loadConfig, listProfiles } from '../config.mjs';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

export async function runScan({ filter, timeout = 8000 } = {}) {
  if (!isAvailable()) throw new Error('No Bluetooth backend available.');
  await waitForPoweredOn();
  process.stdout.write(`Bluetooth ${c.green('on')}. Scanning for ${(timeout / 1000).toFixed(0)}s...\n\n`);

  const needle = filter ? String(filter).toLowerCase() : null;
  const found = await scan({
    timeout,
    filter: needle ? (d) => d.name.toLowerCase().includes(needle) : undefined,
    onFound: (d) => {
      process.stdout.write(
        `  ${d.id}  ${rssiColour(d.rssi).padEnd(20)} ${d.name}\n`
      );
    },
  });

  process.stdout.write(`\n${found.length} device(s) found:\n`);
  for (const d of [...found].sort(byRssi)) {
    process.stdout.write(`\n  ${c.bold(d.name)}\n`);
    process.stdout.write(`    id          ${d.id}\n`);
    process.stdout.write(`    address     ${d.address} (${d.addressType})\n`);
    process.stdout.write(`    rssi        ${d.rssi} dBm  ${rssiColour(d.rssi)}\n`);
    process.stdout.write(`    connectable ${d.connectable ?? 'unknown'}\n`);
    if (d.serviceUuids.length) process.stdout.write(`    services    ${d.serviceUuids.join(', ')}\n`);
    if (d.manufacturerData) process.stdout.write(`    mfg data    ${d.manufacturerData}\n`);
  }
  process.stdout.write(
    `\nPrinter-like devices (name or "printer"/"pos"/"rp" in the name) are usually the ones you want.\n` +
      `Next: ${c.bold('resi probe --device <id> --save <name>')}\n`
  );
}

export async function runProbe({ device, save, timeout = 15000 } = {}) {
  if (!device) {
    const saved = (await listProfiles()).join(', ');
    throw new Error(`Pass --device <mac|id>.${saved ? ` Saved profiles: ${saved}` : ''}`);
  }
  process.stdout.write(`Connecting to ${c.bold(device)}...\n`);
  const conn = await PrinterConnection.connect(device, { timeout });
  process.stdout.write(`${c.green('connected')}  ${conn.name ?? ''}  ${c.dim(conn.id)}\n`);

  const chars = await conn.discover();
  process.stdout.write(`\nMTU ${conn.mtu ?? 'unknown'}\n`);
  process.stdout.write(`${chars.length} characteristic(s):\n`);
  for (const ch of chars) {
    process.stdout.write(`  ${c.bold(ch.uuid)}${ch.name ? ` (${ch.name})` : ''}\n`);
    process.stdout.write(`    service ${ch.serviceUuid}\n`);
    process.stdout.write(`    props   ${ch.properties.join(', ') || 'none'}\n`);
  }

  const target = conn.writeTarget();
  if (!target) {
    process.stdout.write(`\n${c.red('No writable characteristic.')} This is probably a classic-Bluetooth (SPP) printer.\n`);
  } else {
    process.stdout.write(`\nWrite target: ${c.green(target.uuid)} (${target.properties.join(', ')}) on service ${target.serviceUuid}\n`);
  }

  if (save) {
    const profile = {
      name: save,
      id: conn.id,
      address: conn.address,
      label: conn.name,
      serviceUuid: target?.serviceUuid ?? null,
      writeUuid: target?.uuid ?? null,
      properties: target?.properties ?? null,
      mtu: conn.mtu,
      discoveredAt: new Date().toISOString(),
    };
    const file = await saveProfile(save, profile);
    const config = await loadConfig();
    await saveConfig({ ...config, device: conn.id });
    process.stdout.write(`\n${c.green('saved')} profile "${save}" -> ${file}\n`);
    process.stdout.write(`  default device set to ${conn.id}\n`);
  }

  process.stdout.write(`\nNext: ${c.bold(`resi print --device ${conn.id} --file assets/resi.pdf`)}\n`);
  await conn.disconnect();
  await sleep(150);
}

export async function runDevices() {
  const names = await listProfiles();
  if (!names.length) {
    process.stdout.write('No saved profiles. Run: resi probe --device <id> --save <name>\n');
    return;
  }
  const config = await loadConfig();
  for (const name of names) {
    const p = await loadProfile(name);
    const marker = config.device === p.id ? c.green(' (default)') : '';
    process.stdout.write(`\n${c.bold(name)}${marker}  ${c.dim(p.id)}\n`);
    if (p.label) process.stdout.write(`  label     ${p.label}\n`);
    process.stdout.write(`  service   ${p.serviceUuid ?? '-'}\n`);
    process.stdout.write(`  write     ${p.writeUuid ?? '-'}\n`);
    if (p.mtu) process.stdout.write(`  mtu       ${p.mtu}\n`);
    if (p.discoveredAt) process.stdout.write(`  found     ${p.discoveredAt}\n`);
  }
}

export { describePeripheral };

function byRssi(a, b) {
  return (b.rssi ?? -999) - (a.rssi ?? -999);
}

function rssiColour(rssi) {
  if (typeof rssi !== 'number') return c.dim('unknown');
  if (rssi > -55) return c.green('excellent');
  if (rssi > -67) return c.green('good');
  if (rssi > -75) return c.yellow('ok');
  if (rssi > -85) return c.yellow('weak');
  return c.red('very weak');
}
