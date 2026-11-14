import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { parseLocation } from './gmaps.js';

/**
 * Short Google Maps link -> {lat,lng} through the resolve-maps-link Edge Function (the browser cannot follow the redirect itself).
 * Returns null when the function is not deployed / unreachable / the link has no coordinates.
 */
export async function resolveShortLink(url, doFetch = fetch) {
  try {
    const res = await doFetch(`${SUPABASE_URL}/functions/v1/resolve-maps-link`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim() }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.url === 'string' ? parseLocation(data.url) : null;
  } catch {
    return null;
  }
}
