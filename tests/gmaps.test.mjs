import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocation, isShortMapsLink } from '../js/gmaps.js';
import { autoName, ratePerUnit, totalFromRate } from '../js/units.js';

test('plain coordinates', () => {
  assert.deepEqual(parseLocation('18.7961, 98.968'), { lat: 18.7961, lng: 98.968 });
  assert.deepEqual(parseLocation('18.7961 98.968'), { lat: 18.7961, lng: 98.968 });
  assert.deepEqual(parseLocation(' 18.7961,98.968 '), { lat: 18.7961, lng: 98.968 });
});
test('google maps links', () => {
  assert.deepEqual(parseLocation('https://www.google.com/maps/@18.79,98.97,17z'), { lat: 18.79, lng: 98.97 });
  assert.deepEqual(parseLocation('https://www.google.com/maps/place/Foo/@18.79,98.97,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d18.7801!4d98.9712'), { lat: 18.7801, lng: 98.9712 });
  assert.deepEqual(parseLocation('https://maps.google.com/?q=18.7801,98.9712'), { lat: 18.7801, lng: 98.9712 });
  assert.deepEqual(parseLocation('https://www.google.com/maps?ll=18.5,99.1&z=15'), { lat: 18.5, lng: 99.1 });
  assert.deepEqual(parseLocation('https://www.google.com/maps/place/18.5,99.1'), { lat: 18.5, lng: 99.1 });
});
test('rejects junk and short links', () => {
  assert.equal(parseLocation('hello'), null);
  assert.equal(parseLocation(''), null);
  assert.equal(parseLocation('999, 999'), null);
  assert.equal(parseLocation('https://maps.app.goo.gl/abc123'), null);
  assert.ok(isShortMapsLink('https://maps.app.goo.gl/abc123'));
});
test('auto name', () => {
  assert.equal(autoName({ type: 'house', price_baht: 2390000, usable_sqm: 70 }), 'บ้าน 2.39M 70ตร.ม.');
  assert.equal(autoName({ type: 'land', price_baht: 3500000, land_sqm: 400 }), 'ที่ดิน 3.5M 100ตร.วา');
  assert.equal(autoName({ type: 'land', price_baht: null, land_sqm: null }), 'ที่ดิน');
  assert.equal(autoName({ type: 'house', price_baht: 950000, usable_sqm: null, land_sqm: 200 }), 'บ้าน 950k 200ตร.ม.');
});
test('rate maths', () => {
  assert.equal(totalFromRate(35000, 400, 'wah'), 3500000);
  assert.equal(ratePerUnit(3500000, 400, 'wah'), 35000);
  assert.equal(totalFromRate(34000, 70, 'sqm'), 2380000);
  assert.equal(totalFromRate(1000000, 1600, 'rai'), 1000000);
  assert.equal(totalFromRate(5, 0, 'sqm'), null);
});

test('degrees-minutes-seconds and the long link from a short-link redirect', () => {
  const d = parseLocation('18°49\'00.4"N 99°03\'49.7"E');
  assert.ok(Math.abs(d.lat - 18.816778) < 1e-5 && Math.abs(d.lng - 99.063806) < 1e-5);
  const l = parseLocation("https://www.google.com/maps/place/18%C2%B049'00.4%22N+99%C2%B003'49.7%22E/@18.8179461,99.0632902,17.25z/data=!4m4!3m3!8m2!3d18.81678!4d99.063812?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D");
  assert.deepEqual(l, { lat: 18.81678, lng: 99.063812 });
  assert.deepEqual(parseLocation("https://www.google.com/maps/place/18%C2%B049'00.4%22N+99%C2%B003'49.7%22E/"), parseLocation('18°49\'00.4"N 99°03\'49.7"E'));
  assert.equal(parseLocation('18°49\'00.4"N'), null);
  assert.ok(parseLocation('99°03\'49.7"E 18°49\'00.4"N').lat > 18);
});
