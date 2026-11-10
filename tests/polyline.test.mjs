import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePolyline, decodePolyline, simplifyPath } from '../js/polyline.js';
import { cleanRoutes } from '../js/model.js';

test('encode matches the published Google example', () => {
  const pts = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
  assert.equal(encodePolyline(pts), '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), pts);
});

test('round trip stays within 1e-5 degrees', () => {
  const pts = Array.from({ length: 200 }, (_, i) => [18.79 + i * 0.00037, 98.97 + Math.sin(i / 7) * 0.002]);
  const back = decodePolyline(encodePolyline(pts));
  assert.equal(back.length, pts.length);
  back.forEach((p, i) => { assert.ok(Math.abs(p[0] - pts[i][0]) < 1e-5 && Math.abs(p[1] - pts[i][1]) < 1e-5); });
});

test('encode/decode edge cases', () => {
  assert.equal(encodePolyline([]), '');
  assert.deepEqual(decodePolyline(''), []);
  assert.deepEqual(decodePolyline(encodePolyline([[18.8, 98.9]])), [[18.8, 98.9]]);
  assert.deepEqual(decodePolyline(null), []);
  assert.deepEqual(decodePolyline('!!!'), []); // not polyline characters
});

test('simplifyPath keeps ends and drops collinear points', () => {
  const line = [[0, 0], [0.0001, 0.001], [0, 0.002], [0.0001, 0.003], [0, 0.004]]; // wiggles of ~11 m
  const s = simplifyPath(line, 0.0002);
  assert.deepEqual(s[0], line[0]);
  assert.deepEqual(s[s.length - 1], line[line.length - 1]);
  assert.ok(s.length < line.length);
  const keep = simplifyPath(line, 0); // no tolerance: nothing removed
  assert.equal(keep.length, line.length);
});

test('cleanRoutes keeps only valid polyline strings per category', () => {
  const good = encodePolyline([[18.8, 98.9], [18.81, 98.91]]);
  const r = cleanRoutes({ hospital: good, mall: 'has spaces', airport: 123, market: '', bogus: good });
  assert.deepEqual(Object.keys(r).sort(), ['airport', 'hospital', 'mall', 'market']);
  assert.equal(r.hospital, good);
  assert.equal(r.mall, null);
  assert.equal(r.airport, null);
  assert.equal(r.market, null);
  assert.equal(cleanRoutes('junk'), null);
  assert.equal(cleanRoutes(null), null);
  assert.equal(cleanRoutes({ hospital: 'a'.repeat(30000) }).hospital, null); // too long
});
