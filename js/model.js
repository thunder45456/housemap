import { CATEGORIES } from './landmarks.js';

export const ROOFS = ['gable', 'hip', 'flat'];
export const FACINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const TYPES = ['house', 'land'];

const MAX_NUM = 1e12;
const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');

/** Returns {ok, value} for a number or blank (null); ok=false when not numeric. */
function num(v) {
  if (isBlank(v)) return { ok: true, value: null };
  if (typeof v !== 'string' && typeof v !== 'number') return { ok: false, value: null };
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(/,/g, ''));
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, value: null };
}

/** Keeps only well-formed road-distance entries; anything else becomes null. */
export function cleanNear(near) {
  if (!near || typeof near !== 'object' || Array.isArray(near)) return null;
  const out = {};
  for (const { id } of CATEGORIES) {
    const e = near[id];
    const ok = e && typeof e === 'object' && typeof e.name === 'string' && e.name.length > 0
      && Number.isFinite(e.lat) && Number.isFinite(e.lng)
      && Number.isFinite(e.km) && e.km >= 0 && e.km <= 5000
      && Number.isFinite(e.min) && e.min >= 0 && e.min <= 100000;
    out[id] = ok ? { name: e.name.slice(0, 80), lat: e.lat, lng: e.lng, km: e.km, min: e.min } : null;
  }
  return out;
}

export function validateParcel(input) {
  const errors = {};
  const value = {};
  const set = (key, rule, msg) => {
    const r = num(input[key]);
    if (!r.ok || (r.value !== null && !rule(r.value))) errors[key] = msg;
    else value[key] = r.value;
  };

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 1 || name.length > 120) errors.name = 'กรุณากรอกชื่อ (ไม่เกิน 120 ตัวอักษร)';
  value.name = name;

  if (!TYPES.includes(input.type)) errors.type = 'เลือกประเภท บ้าน หรือ ที่ดิน';
  value.type = input.type;

  set('price_baht', (n) => Number.isInteger(n) && n >= 0 && n <= MAX_NUM, 'ราคาต้องเป็นจำนวนเต็มบาท ไม่ติดลบ');
  set('usable_sqm', (n) => n > 0 && n <= MAX_NUM, 'พื้นที่ใช้สอยต้องมากกว่า 0');
  set('land_sqm', (n) => n > 0 && n <= MAX_NUM, 'ขนาดที่ดินต้องมากกว่า 0');
  set('floors', (n) => Number.isInteger(n) && n >= 1 && n <= 10, 'จำนวนชั้น 1–10');
  set('bedrooms', (n) => Number.isInteger(n) && n >= 0 && n <= 30, 'ห้องนอน 0–30');
  set('bathrooms', (n) => Number.isInteger(n) && n >= 0 && n <= 30, 'ห้องน้ำ 0–30');
  set('footprint_w', (n) => n > 0, 'ต้องมากกว่า 0');
  set('footprint_d', (n) => n > 0, 'ต้องมากกว่า 0');

  const lat = typeof input.lat === 'number' ? input.lat : Number(input.lat);
  const lng = typeof input.lng === 'number' ? input.lng : Number(input.lng);
  if (!Number.isFinite(lat) || lat < 5.5 || lat > 20.5) errors.lat = 'ตำแหน่งต้องอยู่ในประเทศไทย';
  if (!Number.isFinite(lng) || lng < 97.3 || lng > 105.7) errors.lng = 'ตำแหน่งต้องอยู่ในประเทศไทย';
  value.lat = lat;
  value.lng = lng;

  const url = typeof input.source_url === 'string' ? input.source_url.trim() : '';
  if (url && !/^https?:\/\/\S+$/i.test(url)) errors.source_url = 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://';
  value.source_url = url;

  const by = typeof input.added_by === 'string' ? input.added_by.trim() : '';
  if (by.length < 1 || by.length > 40) errors.added_by = 'กรุณากรอกชื่อคนเพิ่ม (ไม่เกิน 40 ตัวอักษร)';
  value.added_by = by;

  value.note = (typeof input.note === 'string' ? input.note.trim() : '').slice(0, 2000);

  const roof = isBlank(input.roof) ? null : input.roof;
  if (roof !== null && !ROOFS.includes(roof)) errors.roof = 'ทรงหลังคาไม่ถูกต้อง';
  value.roof = roof;
  const facing = isBlank(input.facing) ? null : input.facing;
  if (facing !== null && !FACINGS.includes(facing)) errors.facing = 'ทิศไม่ถูกต้อง';
  value.facing = facing;

  value.garage = input.garage === true ? true : input.garage === false ? false : null;
  value.near = cleanNear(input.near);

  const ok = Object.keys(errors).length === 0;
  return ok ? { ok, errors, value } : { ok, errors };
}

const SORT_KEY = { price: 'price_baht', land: 'land_sqm', usable: 'usable_sqm', created: 'created_at' };

export function filterSort(parcels, opts = {}) {
  const { type = 'all', minPrice, maxPrice, query, sortBy = 'created', dir = 'desc', dist, zone } = opts;
  const distOn = dist && dist.category && Number.isFinite(dist.maxKm) && typeof dist.distOf === 'function';
  const q = query ? query.trim().toLowerCase() : '';
  const hit = (p) =>
    !p.deleted_at &&
    (type === 'all' || p.type === type) &&
    (minPrice == null || (p.price_baht != null && p.price_baht >= minPrice)) &&
    (maxPrice == null || (p.price_baht != null && p.price_baht <= maxPrice)) &&
    (!q || [p.name, p.note, p.added_by].some((s) => String(s ?? '').toLowerCase().includes(q))) &&
    (!zone || !zone.id || (zone.zoneOf(p) ?? 'unknown') === zone.id) &&
    (!distOn || (() => { const km = dist.distOf(p, dist.category); return km != null && km <= dist.maxKm; })());

  const key = SORT_KEY[sortBy] ?? 'created_at';
  const sign = dir === 'asc' ? 1 : -1;
  return parcels.filter(hit).sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return x < y ? -sign : x > y ? sign : 0;
  });
}
