import test from 'node:test';
import assert from 'node:assert/strict';
import { routeUrl, parseOsrm, formatDuration } from '../js/routing.js';

test('routeUrl uses lng,lat order and full geojson', () => {
  const u = routeUrl({ lat: 18.8, lng: 98.9 }, { lat: 18.7, lng: 99.0 });
  assert.ok(u.includes('/driving/98.9,18.8;99,18.7'), u);
  assert.ok(u.includes('overview=full') && u.includes('geometries=geojson'));
});

test('parseOsrm converts to lat,lng and units', () => {
  const r = parseOsrm({ code: 'Ok', routes: [{ distance: 2500, duration: 300, geometry: { coordinates: [[98.9, 18.8], [99.0, 18.7]] } }] });
  assert.deepEqual(r.coords, [[18.8, 98.9], [18.7, 99.0]]);
  assert.equal(r.km, 2.5);
  assert.equal(r.minutes, 5);
});

test('parseOsrm returns null for no route / bad payloads', () => {
  assert.equal(parseOsrm(null), null);
  assert.equal(parseOsrm({ code: 'NoRoute', routes: [] }), null);
  assert.equal(parseOsrm({ code: 'Ok', routes: [] }), null);
  assert.equal(parseOsrm({ code: 'Ok', routes: [{ distance: 1, duration: 1 }] }), null);
});

test('formatDuration', () => {
  assert.equal(formatDuration(0.2), '1 นาที');
  assert.equal(formatDuration(4.6), '5 นาที');
  assert.equal(formatDuration(65), '1 ชม. 5 นาที');
  assert.equal(formatDuration(120), '2 ชม.');
});
