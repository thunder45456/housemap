import test from 'node:test';
import assert from 'node:assert/strict';
import { exportJson, planImport } from '../js/importer.js';

const P = (n, o = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, type: 'house', name: `บ้าน ${n}`, price_baht: 1000000,
  usable_sqm: 100, floors: 1, bedrooms: 2, bathrooms: 1, land_sqm: 200, source_url: '', note: '',
  added_by: 'a', lat: 18.8, lng: 99, roof: null, facing: null, footprint_w: null, footprint_d: null,
  version: 3, deleted_at: null, created_at: '2026-01-01T00:00:00Z', ...o,
});

test('round trip adds everything to an empty db', () => {
  const list = [P(1), P(2)];
  const plan = planImport(exportJson(list), []);
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.toAdd.map((p) => p.id), [list[0].id, list[1].id]);
  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.invalid.length, 0);
});

test('existing ids are skipped', () => {
  const list = [P(1), P(2)];
  const plan = planImport(exportJson(list), [P(1)]);
  assert.deepEqual(plan.toAdd.map((p) => p.id), [list[1].id]);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].id, list[0].id);
});

test('duplicate ids inside the file: second is skipped', () => {
  const plan = planImport(exportJson([P(1), P(1)]), []);
  assert.equal(plan.toAdd.length, 1);
  assert.equal(plan.skipped.length, 1);
});

test('not JSON / other app -> error', () => {
  assert.ok(planImport('not json', []).error);
  assert.ok(planImport(JSON.stringify({ app: 'other', parcels: [] }), []).error);
  assert.ok(planImport(JSON.stringify({ app: 'housemap' }), []).error);
});

test('invalid item reported with index and not added', () => {
  const plan = planImport(exportJson([P(1), P(2, { lat: 0 })]), []);
  assert.equal(plan.toAdd.length, 1);
  assert.equal(plan.invalid.length, 1);
  assert.equal(plan.invalid[0].index, 1);
  assert.ok(plan.invalid[0].errors.lat);
});

test('missing or malformed id is invalid', () => {
  const bad = P(1);
  delete bad.id;
  const plan = planImport(exportJson([bad, P(2, { id: 'nope' })]), []);
  assert.equal(plan.toAdd.length, 0);
  assert.equal(plan.invalid.length, 2);
});

test('soft-deleted items are skipped, empty list is fine', () => {
  const plan = planImport(exportJson([P(1, { deleted_at: '2026-02-02T00:00:00Z' })]), []);
  assert.equal(plan.toAdd.length, 0);
  assert.equal(plan.skipped.length, 1);
  const empty = planImport(exportJson([]), []);
  assert.deepEqual([empty.error, empty.toAdd, empty.skipped, empty.invalid], [undefined, [], [], []]);
});

test('export includes deleted rows', () => {
  const data = JSON.parse(exportJson([P(1, { deleted_at: 'x' })]));
  assert.equal(data.app, 'housemap');
  assert.equal(data.parcels.length, 1);
});
