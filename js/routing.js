const BASE = 'https://router.project-osrm.org/route/v1/driving';

export function routeUrl(from, to) {
  return `${BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
}

/** OSRM JSON -> { coords:[[lat,lng]...], km, minutes } or null when there is no usable route. */
export function parseOsrm(json) {
  if (!json || json.code !== 'Ok' || !Array.isArray(json.routes) || json.routes.length === 0) return null;
  const r = json.routes[0];
  const pts = r.geometry && r.geometry.coordinates;
  if (!Array.isArray(pts) || pts.length < 2) return null;
  return { coords: pts.map(([lng, lat]) => [lat, lng]), km: r.distance / 1000, minutes: r.duration / 60 };
}

export function formatDuration(minutes) {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} ชม. ${rest} นาที` : `${h} ชม.`;
}

/** Fetches a driving route. Throws Error with a Thai message on failure. */
export async function fetchRoute(from, to) {
  let res;
  try {
    res = await fetch(routeUrl(from, to), { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error('เชื่อมต่อบริการเส้นทางไม่ได้');
  }
  if (!res.ok) throw new Error(`บริการเส้นทางตอบกลับผิดพลาด (${res.status})`);
  const parsed = parseOsrm(await res.json().catch(() => null));
  if (!parsed) throw new Error('หาเส้นทางไปที่นั่นไม่ได้');
  return parsed;
}

// ---- road distance from one point to many landmarks (OSRM table service) ----
import { CATEGORIES, nearestCandidates } from './landmarks.js';

export function tableUrl(from, dests) {
  const coords = [from, ...dests].map((p) => `${p.lng},${p.lat}`).join(';');
  const destIdx = dests.map((_, i) => i + 1).join(';');
  return `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&destinations=${destIdx}&annotations=distance,duration`;
}

/** OSRM table JSON -> [{km, min} | null per destination], or null for a bad payload. */
export function parseTable(json, count) {
  if (!json || json.code !== 'Ok') return null;
  const d = json.distances?.[0];
  const t = json.durations?.[0];
  if (!Array.isArray(d) || !Array.isArray(t) || d.length !== count || t.length !== count) return null;
  return d.map((m, i) => (m == null || t[i] == null ? null : { km: m / 1000, min: t[i] / 60 }));
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Picks the road-nearest candidate per category -> { hospital: {name,lat,lng,km,min} | null, ... } */
export function pickNearest(cands, results) {
  const near = Object.fromEntries(CATEGORIES.map((c) => [c.id, null]));
  cands.forEach((c, i) => {
    const r = results[i];
    if (!r) return;
    const cur = near[c.t];
    if (!cur || r.km < cur.km) near[c.t] = { name: c.n, lat: c.lat, lng: c.lng, km: r.km, min: r.min };
  });
  for (const k of Object.keys(near)) {
    if (near[k]) near[k] = { ...near[k], km: round1(near[k].km), min: Math.round(near[k].min) };
  }
  return near;
}

/** Road distances from a point to the road-nearest landmark of each category. Throws Error (Thai message) on failure. */
export async function computeNear(point, landmarks) {
  const cands = nearestCandidates(point, landmarks, 5);
  if (cands.length === 0) throw new Error('ยังไม่มีข้อมูลสถานที่สำคัญ');
  let res;
  try {
    res = await fetch(tableUrl(point, cands), { signal: AbortSignal.timeout(20000) });
  } catch {
    throw new Error('เชื่อมต่อบริการเส้นทางไม่ได้');
  }
  if (!res.ok) throw new Error(`บริการเส้นทางตอบกลับผิดพลาด (${res.status})`);
  const parsed = parseTable(await res.json().catch(() => null), cands.length);
  if (!parsed) throw new Error('คำนวณระยะทางไม่ได้');
  return pickNearest(cands, parsed);
}
