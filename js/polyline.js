// Google "encoded polyline" (precision 5) + path simplification, so a stored route takes a few KB.

const PRECISION = 1e5;
const POLYLINE_CHARS = /^[?-~]+$/; // ASCII 63..126, the only characters an encoded polyline uses

function encodeNumber(n) {
  let v = Math.round(n * PRECISION);
  v = v < 0 ? ~(v << 1) : v << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

/** [[lat,lng],...] -> encoded string */
export function encodePolyline(points) {
  let out = '';
  let pLat = 0;
  let pLng = 0;
  for (const [lat, lng] of points) {
    const la = Math.round(lat * PRECISION);
    const ln = Math.round(lng * PRECISION);
    out += encodeNumber((la - pLat) / PRECISION) + encodeNumber((ln - pLng) / PRECISION);
    pLat = la;
    pLng = ln;
  }
  return out;
}

/** encoded string -> [[lat,lng],...]; returns [] for anything that is not a valid polyline. */
export function decodePolyline(str) {
  if (typeof str !== 'string' || str.length === 0 || !POLYLINE_CHARS.test(str)) return [];
  const pts = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b;
    do {
      if (i >= str.length) return null;
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) return pts;
    lat += dLat;
    lng += dLng;
    pts.push([lat / PRECISION, lng / PRECISION]);
  }
  return pts;
}

/** Douglas-Peucker on [[lat,lng],...] with tolerance in degrees (about 111 km per degree). */
export function simplifyPath(points, tol) {
  if (points.length < 3 || !(tol > 0)) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ay, ax] = points[a];
    const [by, bx] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const norm = Math.hypot(dx, dy);
    let far = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [py, px] = points[i];
      const d = norm === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * (px - ax) - dx * (py - ay)) / norm;
      if (d > far) { far = d; idx = i; }
    }
    if (far > tol) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
