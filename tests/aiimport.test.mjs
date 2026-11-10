import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, extractItems, normalizeItem } from '../js/aiimport.js';
import { geocodeUrl, parseNominatim } from '../js/geocode.js';
import { validateParcel } from '../js/model.js';

test('prompt lists every field and warns about personal data', () => {
  const p = buildPrompt();
  for (const k of ['type', 'name', 'price_baht', 'usable_sqm', 'land_rai', 'land_ngan', 'land_wah', 'floors', 'bedrooms', 'bathrooms', 'address_text', 'lat', 'lng', 'source_url', 'note', 'roof', 'facing']) {
    assert.ok(p.includes(k), `missing ${k}`);
  }
  assert.ok(p.includes('เบอร์โทร'));
  assert.ok(p.toLowerCase().includes('json'));
});

test('extractItems: plain object, array, wrapper, fenced block, chatter around', () => {
  assert.equal(extractItems('{"name":"a"}').items.length, 1);
  assert.equal(extractItems('[{"name":"a"},{"name":"b"}]').items.length, 2);
  assert.equal(extractItems('{"parcels":[{"name":"a"},{"name":"b"}]}').items.length, 2);
  assert.equal(extractItems('นี่ครับ\n```json\n{"name":"a"}\n```\nหวังว่าช่วยได้').items[0].name, 'a');
  assert.equal(extractItems('ผลลัพธ์: {"name":"x","note":"มี } ในข้อความ"} จบ').items[0].name, 'x');
});

test('extractItems errors', () => {
  assert.ok(extractItems('').error);
  assert.ok(extractItems('ไม่มี json เลย').error);
  assert.ok(extractItems('{"name": ').error);
  assert.ok(extractItems('[1,2,3]').error);
  assert.equal(extractItems(JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ name: `n${i}` })))).items.length, 20);
});

test('normalizeItem converts rai/ngan/wah, Thai type words, price strings', () => {
  const n = normalizeItem({ type: 'ที่ดิน', name: ' ที่ดินสวย ', price_baht: '3,500,000', land_rai: 1, land_ngan: 2, land_wah: 25, address_text: 'อ.แม่ริม เชียงใหม่' });
  assert.equal(n.values.type, 'land');
  assert.equal(n.values.name, 'ที่ดินสวย');
  assert.equal(n.values.price_baht, 3500000);
  assert.equal(n.values.land_sqm, 2500);
  assert.equal(n.addressText, 'อ.แม่ริม เชียงใหม่');
  assert.equal(n.hasCoords, false);
  const m = normalizeItem({ price_baht: '3.5 ล้านบาท' });
  assert.equal(m.values.price_baht, 3500000);
});

test('normalizeItem keeps explicit land_sqm, coordinates, and drops junk safely', () => {
  const n = normalizeItem({ type: 'house', land_sqm: 200, land_wah: 99, lat: '18.8', lng: 98.9, floors: '2', bedrooms: 3, roof: 'gable', facing: 'ใต้' });
  assert.equal(n.values.land_sqm, 200);
  assert.equal(n.hasCoords, true);
  assert.equal(n.values.lat, 18.8);
  assert.equal(n.values.floors, 2);
  assert.equal(n.values.facing, 'S');
  const bad = normalizeItem({ type: 'castle', price_baht: 'ไม่ระบุ', lat: 'x', roof: 'dome', facing: 'up', floors: {} });
  assert.equal(bad.values.type, 'house');
  assert.equal(bad.values.price_baht, null);
  assert.equal(bad.hasCoords, false);
  assert.equal(bad.values.roof, null);
  assert.equal(bad.values.facing, null);
  assert.equal(bad.values.floors, null);
});

test('normalizeItem output is accepted by validateParcel once a pin and author exist', () => {
  const n = normalizeItem({ type: 'house', name: 'บ้านเดี่ยว', price_baht: 4200000, usable_sqm: 180, land_wah: 60, floors: 2, bedrooms: 3, bathrooms: 2, source_url: 'https://example.com/x' });
  const v = validateParcel({ ...n.values, lat: 18.8, lng: 98.99, added_by: 'ตูน' });
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.equal(v.value.land_sqm, 240);
});

test('geocode url and parsing', () => {
  const u = geocodeUrl('แม่ริม เชียงใหม่');
  assert.ok(u.startsWith('https://nominatim.openstreetmap.org/search?'));
  assert.ok(u.includes('countrycodes=th') && u.includes('format=jsonv2') && u.includes('limit=1'));
  assert.deepEqual(parseNominatim([{ lat: '18.9', lon: '98.95', display_name: 'แม่ริม' }]), { lat: 18.9, lng: 98.95, label: 'แม่ริม' });
  assert.equal(parseNominatim([]), null);
  assert.equal(parseNominatim(null), null);
  assert.equal(parseNominatim([{ lat: 'x', lon: 'y' }]), null);
  assert.equal(parseNominatim([{ lat: '40', lon: '98' }]), null); // outside Thailand
});

test('extractItems skips junk JSON-looking bits before the real object', () => {
  const r = extractItems('ตามประกาศ [1] และ [2, 3] นี่คือข้อมูล:\n```json\n{"name":"จริง"}\n```');
  assert.equal(r.items[0].name, 'จริง');
});

test('extractItems does not hang on thousands of unbalanced brackets', () => {
  const t0 = Date.now();
  const r = extractItems('[{'.repeat(20000));
  assert.ok(r.error);
  assert.ok(Date.now() - t0 < 1500, 'too slow');
});
