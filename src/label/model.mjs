/**
 * Canonical label shape. Every input source (PDF, pasted text, JSON, form)
 * is normalised into this so the renderer only ever sees one structure.
 */
export function createLabel(input = {}) {
  return {
    trackingNumber: str(input.trackingNumber ?? input.resi ?? input.awb ?? ''),
    orderNumber: str(input.orderNumber ?? input.pesanan ?? ''),
    service: str(input.service ?? ''),
    routeCode: str(input.routeCode ?? ''),
    labelRef: str(input.labelRef ?? ''),
    shipBy: str(input.shipBy ?? input.batasKirim ?? ''),
    weight: str(input.weight ?? input.berat ?? ''),
    codCheckFirst: str(input.codCheckFirst ?? ''),
    notes: str(input.notes ?? ''),
    receiver: party(input.receiver ?? {}),
    sender: party(input.sender ?? {}),
    items: Array.isArray(input.items) ? input.items.map(normalizeItem).filter((i) => i.name || i.qty) : [],
    trackingUrl: str(input.trackingUrl ?? ''),
  };
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

function party(p = {}) {
  return {
    name: str(p.name),
    address: Array.isArray(p.address) ? p.address.map(str).filter(Boolean) : str(p.address).split(/\n/).map((s) => s.trim()).filter(Boolean),
    phone: str(p.phone),
    city: str(p.city),
  };
}

function normalizeItem(i = {}) {
  return {
    no: str(i.no ?? i.n ?? ''),
    name: str(i.name ?? i.nama ?? ''),
    sku: str(i.sku ?? ''),
    variation: str(i.variation ?? i.variasi ?? ''),
    qty: str(i.qty ?? ''),
  };
}

export const TRACKING_RE = /\b([A-Z][A-Z0-9]{1,7}\d{8,20})\b/;

/** A label is printable when we at least have a tracking number. */
export function validate(label) {
  const errors = [];
  const warnings = [];
  if (!label.trackingNumber) {
    errors.push('tracking number is required');
  } else if (!/^[A-Z0-9-]{6,32}$/i.test(label.trackingNumber)) {
    errors.push(`tracking number looks invalid: "${label.trackingNumber}"`);
  }
  if (!label.receiver.name && !label.receiver.address.length) {
    warnings.push('receiver is empty');
  }
  if (!label.shipBy) warnings.push('no shipping deadline (Batas Kirim)');
  if (!label.items.length) warnings.push('no product rows');
  return { ok: errors.length === 0, errors, warnings };
}

export function partyLine(p) {
  return [p.name, ...p.address, p.city].filter(Boolean).join(' | ');
}

export default createLabel;
