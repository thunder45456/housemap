export const CATEGORIES = [
  { id: 'hospital', label: 'โรงพยาบาล', short: 'รพ.', color: '#d6336c' },
  { id: 'mall', label: 'ห้าง', short: 'ห้าง', color: '#7048e8' },
  { id: 'airport', label: 'สนามบิน', short: 'สนามบิน', color: '#1c7ed6' },
  { id: 'market', label: 'ตลาด', short: 'ตลาด', color: '#0c8599' },
];
const IDS = new Set(CATEGORIES.map((c) => c.id));

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle (straight-line) distance in km. Used only to pick route candidates. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The `perCategory` straight-line-nearest landmarks of every category (candidates for road routing). */
export function nearestCandidates(point, items, perCategory = 5) {
  const buckets = new Map(CATEGORIES.map((c) => [c.id, []]));
  for (const it of items) {
    if (!IDS.has(it.t)) continue;
    buckets.get(it.t).push({ ...it, straightKm: haversineKm(point.lat, point.lng, it.lat, it.lng) });
  }
  const out = [];
  for (const c of CATEGORIES) {
    out.push(...buckets.get(c.id).sort((a, b) => a.straightKm - b.straightKm).slice(0, perCategory));
  }
  return out;
}

/** 2 -> '2', 5.43 -> '5.4', 12.7 -> '13' (no trailing .0). */
export const formatKm = (km) => String(km < 10 ? +km.toFixed(1) : Math.round(km));

export async function loadLandmarks(url = 'landmarks.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`landmarks ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.items) ? data.items.filter((i) => IDS.has(i.t)) : [];
}
