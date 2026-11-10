// Live check against the real Supabase project.
// Usage: GROUP_CODE=xxxx node tests/api_smoke.mjs   (code comes from env, never from a file)
import assert from 'node:assert/strict';
import { listParcels, saveParcel, setDeleted, ApiError } from '../js/api.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config.js';

const code = process.env.GROUP_CODE;
assert.ok(code, 'set GROUP_CODE env var');

const rejects = async (fn, wantCode) => {
  try { await fn(); } catch (e) {
    assert.ok(e instanceof ApiError, `expected ApiError, got ${e}`);
    assert.equal(e.code, wantCode, `expected ${wantCode}, got ${e.code}: ${e.message}`);
    return;
  }
  assert.fail(`expected rejection ${wantCode}`);
};

const base = {
  type: 'house', name: '__smoke_test__', price_baht: 1000000, usable_sqm: 100, floors: 1,
  bedrooms: 2, bathrooms: 1, land_sqm: 200, source_url: 'https://example.com', note: 'v1',
  added_by: 'smoke', lat: 18.79, lng: 98.98, roof: null, facing: null, footprint_w: null, footprint_d: null,
};

await rejects(() => listParcels('wrong-code'), 'bad_code');
await rejects(() => listParcels(''), 'bad_code');
console.log('ok  wrong/empty code rejected');

const a = await saveParcel(code, base, null);
assert.equal(a.version, 1);
const b = await saveParcel(code, { ...base, id: a.id, note: 'v2' }, 1);
assert.equal(b.version, 2);
await rejects(() => saveParcel(code, { ...base, id: a.id, note: 'STALE' }, 1), 'conflict');
const row = (await listParcels(code)).find((p) => p.id === a.id);
assert.equal(row.note, 'v2');
assert.equal(row.version, 2);
console.log('ok  insert / update / stale save conflict, nothing overwritten');

const d = await setDeleted(code, a.id, true, 2);
assert.ok(d.deleted_at);
await rejects(() => setDeleted(code, a.id, false, 2), 'conflict');
const r = await setDeleted(code, a.id, false, 3);
assert.equal(r.deleted_at, null);
console.log('ok  soft delete / restore with version check');

const direct = await fetch(`${SUPABASE_URL}/rest/v1/parcels?select=id`, {
  headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
});
const directBody = await direct.json().catch(() => null);
assert.ok(!direct.ok || (Array.isArray(directBody) && directBody.length === 0), 'direct table read must not leak rows');
console.log(`ok  direct table read blocked (HTTP ${direct.status})`);

console.log(`\nAll good. Remove the test row in SQL Editor:\n  delete from public.parcels where name = '__smoke_test__';`);
