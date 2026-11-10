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
