import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createLabel } from './model.mjs';

/**
 * Interactive editor. Every field is pre-filled from whatever the parser
 * managed to recover, so the user only has to correct what is wrong.
 */
export async function promptLabel(initial = {}, { reader = createInterface({ input: stdin, output: stdout }) } = {}) {
  const base = createLabel(initial);
  const out = [];
  out.push(await ask(reader, 'Nomor resi / tracking', base.trackingNumber));
  out.push(await ask(reader, 'No. pesanan', base.orderNumber));
  out.push(await ask(reader, 'Layanan (ECO/REG/...)', base.service));
  out.push(await ask(reader, 'Rute', base.routeCode));
  out.push(await ask(reader, 'Kode label', base.labelRef));
  out.push(await ask(reader, 'Batas kirim', base.shipBy));
  out.push(await ask(reader, 'Berat', base.weight));
  out.push(await ask(reader, 'COD cek dulu (Ya/Tidak)', base.codCheckFirst));

  const receiverName = await ask(reader, 'Nama penerima', base.receiver.name);
  const receiverPhone = await ask(reader, 'No. HP penerima', base.receiver.phone);
  const receiverAddress = await askMultiline(reader, 'Alamat penerima', base.receiver.address);
  const receiverCity = await ask(reader, 'Kota/kabupaten penerima', base.receiver.city);

  const senderName = await ask(reader, 'Nama pengirim', base.sender.name);
  const senderPhone = await ask(reader, 'No. HP pengirim', base.sender.phone);
  const senderAddress = await askMultiline(reader, 'Alamat pengirim', base.sender.address);
  const senderCity = await ask(reader, 'Kota/kabupaten pengirim', base.sender.city);

  const itemCount = Number(await ask(reader, 'Jumlah baris produk (0 = tidak ada)', base.items.length || 0));
  const items = [];
  for (let i = 0; i < itemCount; i++) {
    items.push({
      no: String(i + 1),
      name: await ask(reader, `  Produk ${i + 1} - nama`, base.items[i]?.name ?? ''),
      variation: await ask(reader, `  Produk ${i + 1} - variasi`, base.items[i]?.variation ?? ''),
      sku: await ask(reader, `  Produk ${i + 1} - SKU`, base.items[i]?.sku ?? ''),
      qty: await ask(reader, `  Produk ${i + 1} - qty`, base.items[i]?.qty ?? ''),
    });
  }

  const notes = await ask(reader, 'Catatan (opsional)', base.notes);
  const trackingUrl = await ask(reader, 'URL tracking untuk QR (opsional)', base.trackingUrl);

  reader.close();
  return createLabel({
    trackingNumber: out[0],
    orderNumber: out[1],
    service: out[2],
    routeCode: out[3],
    labelRef: out[4],
    shipBy: out[5],
    weight: out[6],
    codCheckFirst: out[7],
    receiver: { name: receiverName, phone: receiverPhone, address: receiverAddress, city: receiverCity },
    sender: { name: senderName, phone: senderPhone, address: senderAddress, city: senderCity },
    items,
    notes,
    trackingUrl,
  });
}

async function ask(reader, question, initial = '') {
  const suffix = initial ? ` [${truncate(initial, 40)}]` : '';
  const answer = await reader.question(`${question}${suffix}: `);
  const trimmed = answer.trim();
  return trimmed || initial;
}

async function askMultiline(reader, question, initial = []) {
  stdout.write(`${question} (satu baris per baris, baris kosong untuk selesai${initial.length ? `, awal: ${initial.length} baris` : ''}):\n`);
  const collected = [];
  for (;;) {
    const answer = (await reader.question('  > ')).trim();
    if (!answer) break;
    collected.push(answer);
  }
  return collected.length ? collected : initial;
}

function truncate(s, n) {
  const t = String(s);
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
