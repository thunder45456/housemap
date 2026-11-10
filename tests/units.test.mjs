import test from 'node:test';
import assert from 'node:assert/strict';
import { toSqm, fromSqm, formatArea } from '../js/units.js';

test('toSqm converts wah, rai, sqm', () => {
  assert.equal(toSqm(1, 'wah'), 4);
  assert.equal(toSqm(1, 'rai'), 1600);
  assert.equal(toSqm(50, 'sqm'), 50);
});

test('fromSqm converts back', () => {
  assert.equal(fromSqm(1600, 'rai'), 1);
  assert.equal(fromSqm(4, 'wah'), 1);
  assert.equal(fromSqm(50, 'sqm'), 50);
});

test('formatArea', () => {
  assert.equal(formatArea(null), '-');
  assert.equal(formatArea(2400), '1 ไร่ 2 งาน');
  const big = formatArea(2500);
  assert.equal(big, '1 ไร่ 2 งาน 25 ตร.วา');
  assert.ok(formatArea(120).includes('ตร.ม.'));
});
