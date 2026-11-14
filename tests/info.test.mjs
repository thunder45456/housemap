import test from 'node:test';
import assert from 'node:assert/strict';
import { infoLines, rowSummary } from '../js/info.js';
import { formatPriceShort, formatSqm } from '../js/units.js';
import { validateParcel } from '../js/model.js';

const near = {
  hospital: { name: 'รพ.A', lat: 1, lng: 2, km: 10, min: 15 },
  mall: null,
  airport: { name: 'สนามบิน', lat: 1, lng: 2, km: 2, min: 5 },
  market: { name: 'ตลาด', lat: 1, lng: 2, km: 5.4, min: 9 },
};
const land = { type: 'land', price_baht: 10000, land_sqm: 400, usable_sqm: 50, floors: 2, bedrooms: 3, bathrooms: 2, garage: true, added_by: 'ทันเด้อ', note: '' };

test('infoLines: vertical list exactly in the requested order', () => {
  const lines = infoLines(land, { near });
  assert.deepEqual(lines.map((l) => l.text), [
    'ที่ดิน ราคา ฿10,000',
    'ราคาต่อ ตร.วา ฿100 · ต่อ ตร.ม. ฿25',
    'ที่ดิน 100 ตร.วา พื้นที่ใช้สอย 50 ตร.ม.',
    '2 ชั้น 3 ห้องนอน 2 ห้องน้ำ',
    'มีโรงรถ',
    'โรงพยาบาล 10 ก.ม.',
    'สนามบิน 2 ก.ม.',
    'ตลาด 5.4 ก.ม.',
    'เพิ่มโดย ทันเด้อ',
  ]);
  assert.equal(lines.find((l) => l.cat === 'hospital').title, '15 นาที · รพ.A');
  assert.deepEqual(lines.filter((l) => l.cat).map((l) => l.cat), ['hospital', 'airport', 'market']);
});

test('infoLines: skips missing parts, shows zone and note, handles no near', () => {
  const house = { type: 'house', price_baht: null, land_sqm: null, usable_sqm: 250, floors: null, bedrooms: 3, bathrooms: null, garage: false, added_by: 'x', note: 'ใกล้ถนนใหญ่' };
  const t = infoLines(house, { zone: 'residential' }).map((l) => l.text);
  assert.deepEqual(t, ['บ้าน ราคา -', 'พื้นที่ใช้สอย 250 ตร.ม.', '3 ห้องนอน', 'ไม่มีโรงรถ', 'โซน ที่อยู่อาศัย', 'หมายเหตุ ใกล้ถนนใหญ่', 'เพิ่มโดย x']);
  assert.ok(infoLines(house, { zone: null }).some((l) => l.text === 'โซน ไม่ระบุ'));
  assert.ok(infoLines(house, { zone: 'outside' }).some((l) => l.text === 'โซน นอกพื้นที่ที่ดึงข้อมูล'));
  assert.ok(!infoLines(house, { zone: undefined }).some((l) => l.text.startsWith('โซน')));
});

test('rowSummary is short', () => {
  assert.equal(rowSummary(land), 'ที่ดิน 100 ตร.วา · 2 ชั้น 3 นอน 2 น้ำ');
  assert.equal(rowSummary({ type: 'land', land_sqm: 2400 }), 'ที่ดิน 1 ไร่ 2 งาน');
  assert.equal(rowSummary({ type: 'house' }), '');
});

test('price short and floor-area units', () => {
  assert.equal(formatPriceShort(3500000), '฿3.5M');
  assert.equal(formatPriceShort(12000000), '฿12M');
  assert.equal(formatPriceShort(950000), '฿950k');
  assert.equal(formatPriceShort(10000), '฿10k');
  assert.equal(formatPriceShort(1500), '฿1.5k');
  assert.equal(formatPriceShort(999), '฿999');
  assert.equal(formatPriceShort(9999999999), '฿10,000M');
  assert.equal(formatPriceShort(null), '-');
  assert.equal(formatSqm(250), '250 ตร.ม.'); // floor area never switches to ตร.วา
  assert.equal(formatSqm(null), '-');
});

test('garage validation: true/false/blank only', () => {
  const base = { type: 'house', name: 'a', added_by: 'b', lat: 18.8, lng: 99 };
  assert.equal(validateParcel({ ...base, garage: true }).value.garage, true);
  assert.equal(validateParcel({ ...base, garage: false }).value.garage, false);
  assert.equal(validateParcel({ ...base }).value.garage, null);
  assert.equal(validateParcel({ ...base, garage: 'yes' }).value.garage, null);
});
