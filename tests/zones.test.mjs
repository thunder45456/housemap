import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONE_CLASSES, pointInRing, prepareZones, zoneAt } from '../js/zones.js';
import { filterSort } from '../js/model.js';

// square lat 18.0..18.2, lng 99.0..99.2 (flat lat,lng pairs, open ring)
const SQ = [18.0, 99.0, 18.0, 99.2, 18.2, 99.2, 18.2, 99.0];
// concave "L" shape
const L = [0, 0, 0, 4, 2, 4, 2, 2, 4, 2, 4, 0];

test('classes in priority order', () => {
  assert.deepEqual(ZONE_CLASSES.map((c) => c.id), ['industrial', 'commercial', 'residential', 'agriculture', 'forest']);
});

test('pointInRing: inside, outside, concave notch', () => {
  assert.equal(pointInRing(18.1, 99.1, SQ), true);
  assert.equal(pointInRing(18.3, 99.1, SQ), false);
  assert.equal(pointInRing(18.1, 98.9, SQ), false);
  assert.equal(pointInRing(1, 1, L), true);
  assert.equal(pointInRing(3, 3, L), false); // in the notch of the L
  assert.equal(pointInRing(3, 1, L), true);
});

const data = {
  classes: ['industrial', 'commercial', 'residential', 'agriculture', 'forest'],
  polys: [
    { c: 2, b: [18.0, 99.0, 18.2, 99.2], r: SQ },
    { c: 0, b: [18.05, 99.05, 18.1, 99.1], r: [18.05, 99.05, 18.05, 99.1, 18.1, 99.1, 18.1, 99.05] },
    { c: 4, b: [10, 10, 11, 11], r: [10, 10, 10, 11, 11, 11, 11, 10] },
  ],
};

test('zoneAt: most specific class wins when polygons overlap, null when outside all', () => {
  const z = prepareZones(data);
  assert.equal(zoneAt(18.07, 99.07, z), 'industrial'); // inside residential AND industrial
  assert.equal(zoneAt(18.15, 99.15, z), 'residential');
  assert.equal(zoneAt(10.5, 10.5, z), 'forest');
  assert.equal(zoneAt(19, 99, z), null);
});

test('zoneAt tolerates empty / missing data', () => {
  assert.equal(zoneAt(18, 99, prepareZones({ classes: [], polys: [] })), null);
  assert.equal(zoneAt(18, 99, null), null);
  assert.equal(zoneAt(18, 99, prepareZones({ classes: ['residential'], polys: [{ c: 9, b: [0, 0, 1, 1], r: [0, 0] }] })), null);
});

const P = (id, zone) => ({ id, type: 'house', name: id, note: '', added_by: 'a', price_baht: 1, created_at: '2026-01-01', deleted_at: null, _z: zone });

test('filterSort zone filter', () => {
  const list = [P('a', 'residential'), P('b', 'industrial'), P('c', null)];
  const zoneOf = (p) => p._z;
  const ids = (zone) => filterSort(list, { sortBy: 'price', dir: 'asc', zone }).map((p) => p.id).sort();
  assert.deepEqual(ids({ id: 'residential', zoneOf }), ['a']);
  assert.deepEqual(ids({ id: 'unknown', zoneOf }), ['c']);
  assert.deepEqual(ids({ id: '', zoneOf }), ['a', 'b', 'c']);
  assert.deepEqual(ids(null), ['a', 'b', 'c']);
});

import { inCoverage, zoneLabel } from '../js/zones.js';

test('coverage: points outside the fetched bbox are flagged, inside are not; no bbox means everywhere', () => {
  const z = prepareZones({ bbox: [18.2, 98.5, 19.4, 99.5], classes: [], polys: [] });
  assert.equal(inCoverage(18.8, 98.98, z), true);
  assert.equal(inCoverage(20.0, 99.0, z), false);
  assert.equal(inCoverage(18.8, 100.2, z), false);
  assert.equal(inCoverage(5, 5, prepareZones({ classes: [], polys: [] })), true);
  assert.equal(zoneLabel('outside'), 'นอกพื้นที่ที่ดึงข้อมูล');
});
