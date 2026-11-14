// Reads a location typed or pasted by the user: plain "lat, lng" or a (long) Google Maps link.
// No network access and no GPS: only the coordinates written inside the text are used.

const inThailandish = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
// order matters: the exact pin (!3d..!4d..) beats the map centre (@..)
const PATTERNS = [
  new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
  new RegExp(String.raw`[?&](?:q|ll|query|destination|daddr|center)=${NUM}(?:,|%2C)\s*${NUM}`, 'i'),
  new RegExp(String.raw`/@${NUM},${NUM}`),
  new RegExp(String.raw`/place/${NUM},${NUM}`),
  new RegExp(String.raw`^\s*${NUM}\s*[,;\s]\s*${NUM}\s*$`),
];

// degrees-minutes-seconds as Google Maps shows them: 18°49'00.4"N 99°03'49.7"E (also ′ ″ and plain 18°49'N)
const DMS = String.raw`(\d{1,3})\s*°\s*(?:(\d{1,2})\s*['′]\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|″|'')?)?)?\s*([NSEW])`;
const DMS_PAIR = new RegExp(String.raw`${DMS}[\s,;+]*${DMS}`, 'i');

function fromDms(s) {
  const m = DMS_PAIR.exec(s);
  if (!m) return null;
  const val = (d, mi, se, h) => (Number(d) + Number(mi || 0) / 60 + Number(se || 0) / 3600) * (/[SW]/i.test(h) ? -1 : 1);
  let a = { v: val(m[1], m[2], m[3], m[4]), h: m[4].toUpperCase() };
  let b = { v: val(m[5], m[6], m[7], m[8]), h: m[8].toUpperCase() };
  if (/[EW]/.test(a.h) && /[NS]/.test(b.h)) [a, b] = [b, a]; // "E then N" order
  if (!/[NS]/.test(a.h) || !/[EW]/.test(b.h)) return null;
  const lat = +a.v.toFixed(6);
  const lng = +b.v.toFixed(6);
  return inThailandish(lat, lng) ? { lat, lng } : null;
}

/** Returns {lat,lng} or null. Accepts "18.79, 98.97", "18.79 98.97" and full Google Maps URLs. */
export function parseLocation(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  if (!s) return null;
  try { s = decodeURIComponent(s); } catch { /* keep raw text */ }
  for (const rx of PATTERNS) {
    const m = rx.exec(s);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (inThailandish(lat, lng)) return { lat, lng };
  }
  return fromDms(s);
}

/** Short links (maps.app.goo.gl, goo.gl/maps) hide the coordinates behind a redirect the browser may not follow. */
export function isShortMapsLink(text) {
  return /^\s*https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(text ?? '');
}
