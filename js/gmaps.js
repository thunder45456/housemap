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
  return null;
}

/** Short links (maps.app.goo.gl, goo.gl/maps) hide the coordinates behind a redirect the browser may not follow. */
export function isShortMapsLink(text) {
  return /^\s*https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(text ?? '');
}
