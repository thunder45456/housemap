import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, nearestCandidates, CATEGORIES } from '../js/landmarks.js';
import { filterSort } from '../js/model.js';

test('categories: no schools', () => {
  assert.deepEqual(CATEGORIES.map((c) => c.id), ['hospital', 'mall', 'airport', 'market']);
});

test('haversineKm', () => {
  assert.equal(haversineKm(18.79, 98.98, 18.79, 98.98), 0);
  assert.ok(Math.abs(haversineKm(18.79, 98.98, 18.79, 99.98) - 105.3) < 0.5);
  assert.ok(Math.abs(haversineKm(18, 99, 19, 99) - 111.2) < 0.3);
});

const items = [
  { t: 'hospital', n: 'h1', lat: 18.80, lng: 98.98 },
  { t: 'hospital', n: 'h2', lat: 18.90, lng: 98.98 },
  { t: 'hospital', n: 'h3', lat: 19.50, lng: 98.98 },
  { t: 'mall', n: 'm1', lat: 18.79, lng: 99.00 },
  { t: 'school', n: 'ignored', lat: 18.79, lng: 98.98 },
];

test('nearestCandidates: top N per category by straight line, ignores unknown categories', () => {
  const c = nearestCandidates({ lat: 18.79, lng: 98.98 }, items, 2);
  assert.deepEqual(c.map((x) => x.n), ['h1', 'h2', 'm1']);
  assert.ok(c.every((x) => typeof x.straightKm === 'number'));
  assert.ok(!c.some((x) => x.t === 'school'));
});

test('nearestCandidates with empty list', () => {
  assert.deepEqual(nearestCandidates({ lat: 18.79, lng: 98.98 }, [], 5), []);
});

const P = (id, km) => ({ id, type: 'house', name: id, note: '', added_by: 'a', price_baht: 1, created_at: '2026-01-01', deleted_at: null, _km: km });

test('filterSort distance filter: within km, unknown distance excluded', () => {
  const list = [P('near', 2), P('far', 9), P('unknown', null), P('edge', 5)];
  const distOf = (p) => p._km;
  const r = filterSort(list, { sortBy: 'price', dir: 'asc', dist: { category: 'hospital', maxKm: 5, distOf } }).map((p) => p.id);
  assert.deepEqual(r.sort(), ['edge', 'near']);
  assert.equal(filterSort(list, { sortBy: 'price', dir: 'asc' }).length, 4);
});

test('filterSort ignores a blank/invalid distance filter', () => {
  const list = [P('a', 99)];
  const distOf = (p) => p._km;
  assert.equal(filterSort(list, { sortBy: 'price', dir: 'asc', dist: { category: 'hospital', maxKm: null, distOf } }).length, 1);
  assert.equal(filterSort(list, { sortBy: 'price', dir: 'asc', dist: { category: '', maxKm: 5, distOf } }).length, 1);
});
