// Land-use zones from OpenStreetMap (volunteer-drawn land use, NOT the legal city plan).
export const ZONE_CLASSES = [
  { id: 'industrial', label: 'อุตสาหกรรม', color: '#868e96' },
  { id: 'commercial', label: 'พาณิชย์', color: '#f76707' },
  { id: 'residential', label: 'ที่อยู่อาศัย', color: '#fab005' },
  { id: 'agriculture', label: 'เกษตร', color: '#82c91e' },
  { id: 'forest', label: 'ป่า', color: '#2b8a3e' },
];
export const zoneLabel = (id) => (id === 'outside' ? 'นอกพื้นที่ที่ดึงข้อมูล' : ZONE_CLASSES.find((c) => c.id === id)?.label ?? 'ไม่มีข้อมูล');

/** Ray casting on a flat ring [lat0,lng0,lat1,lng1,...] (open ring). */
export function pointInRing(lat, lng, flat) {
  let inside = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = flat[i * 2], xi = flat[i * 2 + 1];
    const yj = flat[j * 2], xj = flat[j * 2 + 1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** zones.json -> { byClass: Map(classId -> [{b, r}]) } (null-safe). */
export function prepareZones(data) {
  const byClass = new Map(ZONE_CLASSES.map((c) => [c.id, []]));
  if (data && Array.isArray(data.classes) && Array.isArray(data.polys)) {
    for (const p of data.polys) {
      const id = data.classes[p.c];
      if (byClass.has(id) && Array.isArray(p.b) && Array.isArray(p.r) && p.r.length >= 6) byClass.get(id).push(p);
    }
  }
  const bbox = Array.isArray(data?.bbox) && data.bbox.length === 4 ? data.bbox : null;
  return { byClass, polys: data?.polys ?? [], classes: data?.classes ?? [], bbox };
}

/** False when the point lies outside the area that was fetched from OpenStreetMap (so 'no zone' would mean 'unknown'). */
export function inCoverage(lat, lng, zones) {
  const b = zones?.bbox;
  return !b || (lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3]);
}

/** Class id of the most specific zone containing the point (priority = ZONE_CLASSES order), or null. */
export function zoneAt(lat, lng, zones) {
  if (!zones || !zones.byClass) return null;
  for (const { id } of ZONE_CLASSES) {
    for (const p of zones.byClass.get(id) ?? []) {
      const b = p.b;
      if (lat < b[0] || lat > b[2] || lng < b[1] || lng > b[3]) continue;
      if (pointInRing(lat, lng, p.r)) return id;
    }
  }
  return null;
}

export async function loadZones(url = 'zones.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`zones ${res.status}`);
  return res.json();
}
