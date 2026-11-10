import { CATEGORIES, formatKm } from './landmarks.js';
import { formatArea, formatPrice, formatSqm } from './units.js';
import { zoneLabel } from './zones.js';

/**
 * The vertical list of facts about a parcel, one line each, in a fixed order.
 * Returns [{ key, text, title?, cat? }]; `cat` marks a distance line (the UI adds a route button to those).
 * opts.near: parcel.near (road distances) | null; opts.zone: undefined = not loaded (line hidden).
 */
export function infoLines(p, { near = null, zone } = {}) {
  const lines = [];
  const add = (key, text, extra = {}) => lines.push({ key, text, ...extra });

  add('price', `${p.type === 'land' ? 'ที่ดิน' : 'บ้าน'} ราคา ${p.price_baht == null ? '-' : formatPrice(p.price_baht)}`);

  const area = [];
  if (p.land_sqm != null) area.push(`ที่ดิน ${formatArea(p.land_sqm)}`);
  if (p.usable_sqm != null) area.push(`พื้นที่ใช้สอย ${formatSqm(p.usable_sqm)}`);
  if (area.length) add('area', area.join(' '));

  const rooms = [];
  if (p.floors != null) rooms.push(`${p.floors} ชั้น`);
  if (p.bedrooms != null) rooms.push(`${p.bedrooms} ห้องนอน`);
  if (p.bathrooms != null) rooms.push(`${p.bathrooms} ห้องน้ำ`);
  if (rooms.length) add('rooms', rooms.join(' '));

  if (p.garage === true) add('garage', 'มีโรงรถ');
  else if (p.garage === false) add('garage', 'ไม่มีโรงรถ');

  if (near) {
    for (const c of CATEGORIES) {
      const n = near[c.id];
      if (n) add(`near-${c.id}`, `${c.label} ${formatKm(n.km)} ก.ม.`, { title: `${n.min} นาที · ${n.name}`, cat: c.id });
    }
  }

  if (zone !== undefined) add('zone', `โซน ${zone ? zoneLabel(zone) : 'ไม่ระบุ'}`);
  if (p.note) add('note', `หมายเหตุ ${p.note}`);
  add('by', `เพิ่มโดย ${p.added_by}`);
  return lines;
}

/** One short line for the collapsed list row. */
export function rowSummary(p) {
  const bits = [];
  if (p.land_sqm != null) bits.push(`ที่ดิน ${formatArea(p.land_sqm)}`);
  const rooms = [];
  if (p.floors != null) rooms.push(`${p.floors} ชั้น`);
  if (p.bedrooms != null) rooms.push(`${p.bedrooms} นอน`);
  if (p.bathrooms != null) rooms.push(`${p.bathrooms} น้ำ`);
  if (rooms.length) bits.push(rooms.join(' '));
  return bits.join(' · ');
}
