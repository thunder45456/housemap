export const CATEGORIES = [
  { id: 'hospital', label: 'โรงพยาบาล', short: 'รพ.', color: '#d6336c' },
  { id: 'mall', label: 'ห้าง', short: 'ห้าง', color: '#7048e8' },
  { id: 'airport', label: 'สนามบิน', short: 'สนามบิน', color: '#1c7ed6' },
  { id: 'school', label: 'โรงเรียน', short: 'รร.', color: '#f08c00' },
  { id: 'market', label: 'ตลาด', short: 'ตลาด', color: '#0c8599' },
];

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle (straight-line) distance in km. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Nearest landmark of every category: { hospital: {name, km, lat, lng} | null, ... } */
export function nearestByCategory(parcel, items) {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c.id, null]));
  for (const it of items) {
    if (!(it.t in out)) continue;
    const km = haversineKm(parcel.lat, parcel.lng, it.lat, it.lng);
    if (out[it.t] === null || km < out[it.t].km) out[it.t] = { name: it.n, km, lat: it.lat, lng: it.lng };
  }
  return out;
}

export const formatKm = (km) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));

export async function loadLandmarks(url = 'landmarks.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`landmarks ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}
