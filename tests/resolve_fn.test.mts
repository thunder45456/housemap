import test from 'node:test';
import assert from 'node:assert/strict';
import { allowed, resolveLink } from '../supabase/functions/resolve-maps-link/index.ts';

test('only Google Maps https links are allowed', () => {
  assert.ok(allowed(new URL('https://maps.app.goo.gl/abc')));
  assert.ok(allowed(new URL('https://www.google.com/maps/place/x')));
  assert.ok(!allowed(new URL('http://maps.app.goo.gl/abc')));
  assert.ok(!allowed(new URL('https://evil.com/maps/x')));
  assert.ok(!allowed(new URL('https://maps.app.goo.gl.evil.com/x')));
  assert.ok(!allowed(new URL('https://www.google.com/search?q=x')));
  assert.ok(!allowed(new URL('https://maps.app.goo.gl:8443/x')));
});

test('follows redirects, rejects hops leaving Google Maps', async () => {
  const mk = (loc?: string) => new Response(null, { status: loc ? 302 : 200, headers: loc ? { location: loc } : {} });
  const ok = (async (u: string) => (u.startsWith('https://maps.app.goo.gl') ? mk('https://www.google.com/maps/place/Foo/@18.8,99.0,17z') : mk())) as typeof fetch;
  assert.equal(await resolveLink('https://maps.app.goo.gl/x', ok), 'https://www.google.com/maps/place/Foo/@18.8,99.0,17z');
  const evil = (async () => mk('https://evil.com/steal')) as typeof fetch;
  await assert.rejects(resolveLink('https://maps.app.goo.gl/x', evil), /redirect_not_allowed/);
  await assert.rejects(resolveLink('https://evil.com/maps/x', ok), /not_maps_link/);
});
