import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShortLink } from '../js/resolve.js';

const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });

test('short link -> coordinates from the long url the function returns', async () => {
  const f = reply(200, { url: "https://www.google.com/maps/place/x/@18.8179461,99.0632902,17z/data=!3d18.81678!4d99.063812" });
  assert.deepEqual(await resolveShortLink('https://maps.app.goo.gl/abc', f), { lat: 18.81678, lng: 99.063812 });
});
test('function missing / failing -> null (form falls back to the manual hint)', async () => {
  assert.equal(await resolveShortLink('https://maps.app.goo.gl/abc', reply(404, {})), null);
  assert.equal(await resolveShortLink('https://maps.app.goo.gl/abc', async () => { throw new TypeError('offline'); }), null);
  assert.equal(await resolveShortLink('https://maps.app.goo.gl/abc', reply(200, { url: 'https://www.google.com/maps' })), null);
});
