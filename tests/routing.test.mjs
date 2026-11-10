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

import { tableUrl, parseTable, pickNearest } from '../js/routing.js';

test('tableUrl: source first, destinations after, distance+duration', () => {
  const u = tableUrl({ lat: 18.8, lng: 98.9 }, [{ lat: 18.7, lng: 99.0 }, { lat: 18.6, lng: 99.1 }]);
  assert.ok(u.includes('/table/v1/driving/98.9,18.8;99,18.7;99.1,18.6'), u);
  assert.ok(u.includes('sources=0') && u.includes('destinations=1;2'));
  assert.ok(u.includes('annotations=distance,duration'));
});

test('parseTable converts metres/seconds and keeps nulls', () => {
  const r = parseTable({ code: 'Ok', distances: [[1000, null, 3000]], durations: [[60, null, 180]] }, 3);
  assert.deepEqual(r, [{ km: 1, min: 1 }, null, { km: 3, min: 3 }]);
  assert.equal(parseTable(null, 1), null);
  assert.equal(parseTable({ code: 'NoTable' }, 1), null);
  assert.equal(parseTable({ code: 'Ok', distances: [[1]], durations: [[1]] }, 2), null); // wrong length
});

test('pickNearest chooses the smallest road distance per category', () => {
  const cands = [
    { t: 'hospital', n: 'A', lat: 1, lng: 2 },
    { t: 'hospital', n: 'B', lat: 3, lng: 4 },
    { t: 'mall', n: 'M', lat: 5, lng: 6 },
    { t: 'airport', n: 'X', lat: 7, lng: 8 },
  ];
  const res = [{ km: 9, min: 20 }, { km: 4.44, min: 10 }, null, { km: 30, min: 40 }];
  const near = pickNearest(cands, res);
  assert.deepEqual(near.hospital, { name: 'B', lat: 3, lng: 4, km: 4.4, min: 10 });
  assert.equal(near.mall, null);
  assert.equal(near.airport.name, 'X');
  assert.equal(near.market, null);
});
