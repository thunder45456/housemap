# Edge Functions

## resolve-maps-link
Turns a Google Maps short link into the long link (the browser cannot do it: CORS).

Deploy (once), either way:
- Dashboard: Supabase -> Edge Functions -> Deploy a new function -> name `resolve-maps-link` -> paste `resolve-maps-link/index.ts` -> Deploy.
- CLI: `supabase functions deploy resolve-maps-link --project-ref kljropifumeqdtsfezsk`

Keep "Verify JWT" ON (the site sends the public anon key). Until it is deployed the form just tells people to paste the long link.
