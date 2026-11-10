import test from 'node:test';
import assert from 'node:assert/strict';
import { validateParcel, filterSort } from '../js/model.js';

const good = () => ({
  type: 'house', name: 'บ้านสันทราย', price_baht: '3500000', usable_sqm: '150',
  floors: '2', bedrooms: '3', bathrooms: '2', land_sqm: '200',
  source_url: 'https://example.com/a', note: '', added_by: 'ตูน',
  lat: 18.8, lng: 99.0,
});

test('valid house passes', () => {
  const r = validateParcel(good());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.price_baht, 3500000);
  assert.equal(r.value.floors, 2);
});

test('blank numeric becomes null', () => {
  const r = validateParcel({ ...good(), price_baht: '  ', usable_sqm: '' });
  assert.equal(r.ok, true);
  assert.equal(r.value.price_baht, null);
  assert.equal(r.value.usable_sqm, null);
});

test('bad numerics rejected', () => {
  assert.ok(validateParcel({ ...good(), price_baht: 'abc' }).errors.price_baht);
  assert.ok(validateParcel({ ...good(), price_baht: '-1' }).errors.price_baht);
  assert.ok(validateParcel({ ...good(), floors: '0' }).errors.floors);
});

test('zero bedrooms ok', () => {
  assert.equal(validateParcel({ ...good(), bedrooms: '0' }).ok, true);
});

test('lat/lng bounds and NaN', () => {
  assert.ok(validateParcel({ ...good(), lat: 0 }).errors.lat);
  assert.ok(validateParcel({ ...good(), lat: NaN }).errors.lat);
  assert.ok(validateParcel({ ...good(), lng: 200 }).errors.lng);
});

test('source_url scheme', () => {
  assert.ok(validateParcel({ ...good(), source_url: 'javascript:alert(1)' }).errors.source_url);
  assert.equal(validateParcel({ ...good(), source_url: 'https://x.com/a' }).ok, true);
  assert.equal(validateParcel({ ...good(), source_url: '' }).ok, true);
});

test('name and added_by required', () => {
  assert.ok(validateParcel({ ...good(), name: '  ' }).errors.name);
  assert.ok(validateParcel({ ...good(), added_by: '' }).errors.added_by);
});

const P = (id, o) => ({ id, type: 'house', name: id, note: '', added_by: 'a', price_baht: null, land_sqm: null, usable_sqm: null, created_at: '2026-01-01', deleted_at: null, ...o });

test('filterSort excludes deleted and puts null last both ways', () => {
  const list = [P('a', { price_baht: 5 }), P('b', { price_baht: null }), P('c', { price_baht: 2 }), P('d', { price_baht: 1, deleted_at: 'x' })];
  const snapshot = JSON.stringify(list);
  const asc = filterSort(list, { sortBy: 'price', dir: 'asc' }).map((p) => p.id);
  const desc = filterSort(list, { sortBy: 'price', dir: 'desc' }).map((p) => p.id);
  assert.deepEqual(asc, ['c', 'a', 'b']);
  assert.deepEqual(desc, ['a', 'c', 'b']);
  assert.equal(JSON.stringify(list), snapshot);
});

test('filterSort type and query and price range', () => {
  const list = [P('a', { type: 'land', price_baht: 10 }), P('b', { note: 'ใกล้ดอยสุเทพ', price_baht: 20 })];
  assert.deepEqual(filterSort(list, { type: 'land', sortBy: 'price', dir: 'asc' }).map((p) => p.id), ['a']);
  assert.deepEqual(filterSort(list, { query: 'ดอยสุเทพ', sortBy: 'price', dir: 'asc' }).map((p) => p.id), ['b']);
  assert.deepEqual(filterSort(list, { minPrice: 15, sortBy: 'price', dir: 'asc' }).map((p) => p.id), ['b']);
});

test('odd input types are rejected, not coerced', () => {
  assert.ok(validateParcel({ ...good(), price_baht: [] }).errors.price_baht);
  assert.ok(validateParcel({ ...good(), price_baht: {} }).errors.price_baht);
  assert.ok(validateParcel({ ...good(), name: {} }).errors.name);
  assert.ok(validateParcel({ ...good(), added_by: ['x'] }).errors.added_by);
  assert.ok(validateParcel({ ...good(), price_baht: 1e30 }).errors.price_baht);
  assert.ok(validateParcel({ ...good(), land_sqm: 1e30 }).errors.land_sqm);
});
