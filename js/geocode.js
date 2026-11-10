export const inThailand = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= 5.5 && lat <= 20.5 && lng >= 97.3 && lng <= 105.7;

export function geocodeUrl(query) {
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=th&accept-language=th&q=${encodeURIComponent(query)}`;
}

/** Nominatim JSON -> {lat, lng, label} or null (also null when the hit is outside Thailand). */
export function parseNominatim(json) {
  if (!Array.isArray(json) || json.length === 0) return null;
  const lat = Number(json[0].lat);
  const lng = Number(json[0].lon);
  if (!inThailand(lat, lng)) return null;
  return { lat, lng, label: String(json[0].display_name ?? '') };
}

/** One user-initiated lookup (Nominatim policy: no bulk use). Returns null when nothing found; throws on network errors. */
export async function geocode(query) {
  const res = await fetch(geocodeUrl(query), { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  return parseNominatim(await res.json().catch(() => null));
}
