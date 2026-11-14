// Supabase Edge Function: follows a Google Maps short link (maps.app.goo.gl/...) on the server and returns the final long URL,
// so the browser (which cannot read that redirect because of CORS) can read the coordinates from it.
// Safety: only https links on Google Maps hosts are followed, every redirect hop is re-checked, at most 5 hops,
// and only the final URL is returned (never page content).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);
const MAPS_HOSTS = new Set(['www.google.com', 'google.com', 'maps.google.com', 'www.google.co.th', 'google.co.th']);

export function allowed(u: URL): boolean {
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  if (SHORT_HOSTS.has(u.hostname)) return u.hostname === 'maps.app.goo.gl' || u.pathname.startsWith('/maps');
  return MAPS_HOSTS.has(u.hostname) && (u.pathname.startsWith('/maps') || u.pathname === '/');
}

export async function resolveLink(input: string, doFetch: typeof fetch = fetch): Promise<string> {
  let cur = new URL(input);
  if (!allowed(cur)) throw new Error('not_maps_link');
  for (let hop = 0; hop < 5; hop++) {
    if (MAPS_HOSTS.has(cur.hostname) && /\/maps\/place\/|\/maps\/@|[?&](q|ll)=/.test(cur.pathname + cur.search)) return cur.toString();
    const res = await doFetch(cur.toString(), { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (HouseMap link resolver)' }, signal: AbortSignal.timeout(8000) });
    const loc = res.headers.get('location');
    if (!loc) return cur.toString();
    const next = new URL(loc, cur);
    if (!allowed(next)) throw new Error('redirect_not_allowed');
    cur = next;
  }
  return cur.toString();
}

if (typeof Deno !== 'undefined') {
  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
    try {
      const { url } = await req.json();
      if (typeof url !== 'string' || url.length > 500) return json({ error: 'bad_request' }, 400);
      return json({ url: await resolveLink(url.trim()) });
    } catch (e) {
      return json({ error: (e as Error).message === 'not_maps_link' ? 'not_maps_link' : 'failed' }, 400);
    }
  });
}
