-- Migration 5 (run ONCE in Supabase -> SQL Editor, in a NEW query).
-- Adds the `routes` column (driving routes to the nearest hospital / mall / airport / market, stored as
-- compact encoded polylines so the map does not have to ask the routing server every time)
-- and lets save_parcel store it. Safe to run more than once. The site keeps working before and after.

alter table public.parcels
  add column if not exists routes jsonb
  check (routes is null or (jsonb_typeof(routes) = 'object' and pg_column_size(routes) < 80000));

create or replace function public.save_parcel(p_code text, p_parcel jsonb, p_expected_version int)
returns public.parcels language plpgsql security definer
set search_path = public, extensions as $$
declare r public.parcels;
begin
  perform public._check_code(p_code);
  if p_expected_version is null then
    insert into public.parcels (id, type, name, price_baht, usable_sqm, floors, bedrooms, bathrooms,
      land_sqm, source_url, note, added_by, lat, lng, roof, facing, footprint_w, footprint_d, near, garage, routes)
    values (
      coalesce((p_parcel->>'id')::uuid, gen_random_uuid()),
      p_parcel->>'type', p_parcel->>'name', (p_parcel->>'price_baht')::bigint,
      (p_parcel->>'usable_sqm')::numeric, (p_parcel->>'floors')::int,
      (p_parcel->>'bedrooms')::int, (p_parcel->>'bathrooms')::int,
      (p_parcel->>'land_sqm')::numeric, coalesce(p_parcel->>'source_url', ''),
      coalesce(p_parcel->>'note', ''), p_parcel->>'added_by',
      (p_parcel->>'lat')::float8, (p_parcel->>'lng')::float8,
      p_parcel->>'roof', p_parcel->>'facing',
      (p_parcel->>'footprint_w')::numeric, (p_parcel->>'footprint_d')::numeric,
      nullif(p_parcel->'near', 'null'::jsonb),
      (p_parcel->>'garage')::boolean,
      nullif(p_parcel->'routes', 'null'::jsonb))
    returning * into r;
    return r;
  end if;

  update public.parcels set
    type = p_parcel->>'type', name = p_parcel->>'name',
    price_baht = (p_parcel->>'price_baht')::bigint,
    usable_sqm = (p_parcel->>'usable_sqm')::numeric,
    floors = (p_parcel->>'floors')::int, bedrooms = (p_parcel->>'bedrooms')::int,
    bathrooms = (p_parcel->>'bathrooms')::int, land_sqm = (p_parcel->>'land_sqm')::numeric,
    source_url = coalesce(p_parcel->>'source_url', ''), note = coalesce(p_parcel->>'note', ''),
    lat = (p_parcel->>'lat')::float8, lng = (p_parcel->>'lng')::float8,
    roof = p_parcel->>'roof', facing = p_parcel->>'facing',
    footprint_w = (p_parcel->>'footprint_w')::numeric,
    footprint_d = (p_parcel->>'footprint_d')::numeric,
    near = nullif(p_parcel->'near', 'null'::jsonb),
    garage = (p_parcel->>'garage')::boolean,
    routes = nullif(p_parcel->'routes', 'null'::jsonb),
    version = version + 1
  where id = (p_parcel->>'id')::uuid and version = p_expected_version and deleted_at is null
  returning * into r;
  if not found then raise exception 'conflict'; end if;
  return r;
end $$;

revoke all on function public.save_parcel(text, jsonb, int) from public;
grant execute on function public.save_parcel(text, jsonb, int) to anon;
