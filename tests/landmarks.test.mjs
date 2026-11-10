import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, nearestByCategory, CATEGORIES } from '../js/landmarks.js';
import { filterSort } from '../js/model.js';

test('haversineKm', () => {
  assert.equal(haversineKm(18.79, 98.98, 18.79, 98.98), 0);
  // 1 degree of longitude at 18.79N is about 105.3 km
  assert.ok(Math.abs(haversineKm(18.79, 98.98, 18.79, 99.98) - 105.3) < 0.5);
  // 1 degree of latitude is about 111.2 km
  assert.ok(Math.abs(haversineKm(18, 99, 19, 99) - 111.2) < 0.3);
});

const items = [
  { t: 'hospital', n: 'รพ.ใกล้', lat: 18.80, lng: 98.98 },
  { t: 'hospital', n: 'รพ.ไกล', lat: 19.50, lng: 98.98 },
  { t: 'school', n: 'โรงเรียน A', lat: 18.79, lng: 99.00 },
];

test('nearestByCategory picks the closest per category and null when none', () => {
  const n = nearestByCategory({ lat: 18.79, lng: 98.98 }, items);
  assert.equal(n.hospital.name, 'รพ.ใกล้');
  assert.ok(n.hospital.km > 1 && n.hospital.km < 1.3);
  assert.equal(n.school.name, 'โรงเรียน A');
  assert.equal(n.airport, null);
  assert.equal(n.mall, null);
  assert.equal(n.market, null);
  assert.deepEqual(Object.keys(n).sort(), CATEGORIES.map((c) => c.id).sort());
});

test('nearestByCategory with empty list', () => {
  const n = nearestByCategory({ lat: 18.79, lng: 98.98 }, []);
  assert.ok(Object.values(n).every((v) => v === null));
});

const P = (id, km) => ({ id, type: 'house', name: id, note: '', added_by: 'a', price_baht: 1, created_at: '2026-01-01', deleted_at: null, _km: km });

test('filterSort distance filter: within km, unknown distance excluded', () => {
  const list = [P('near', 2), P('far', 9), P('unknown', null), P('edge', 5)];
  const distOf = (p) => p._km;
  const r = filterSort(list, { sortBy: 'price', dir: 'asc', dist: { category: 'hospital', maxKm: 5, distOf } }).map((p) => p.id);
  assert.deepEqual(r.sort(), ['edge', 'near']);
  const all = filterSort(list, { sortBy: 'price', dir: 'asc' }).map((p) => p.id);
  assert.equal(all.length, 4);
});

test('filterSort ignores a blank/invalid distance filter', () => {
  const list = [P('a', 99)];
  const distOf = (p) => p._km;
  assert.equal(filterSort(list, { sortBy: 'price', dir: 'asc', dist: { category: 'hospital', maxKm: null, distOf } }).length, 1);
  assert.equal(filterSort(list, { sortBy: 'price', dir: 'asc', dist: { category: '', maxKm: 5, distOf } }).length, 1);
});
