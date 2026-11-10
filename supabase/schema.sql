-- HouseMap schema. Run once in Supabase → SQL Editor.
-- Tables are locked (RLS on, no policies, no grants). Everything goes through
-- RPC functions that verify the group code hash.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.parcels (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('house','land')),
  name text not null check (char_length(name) between 1 and 120),
  price_baht bigint check (price_baht >= 0),
  usable_sqm numeric check (usable_sqm > 0),
  floors int check (floors between 1 and 10),
  bedrooms int check (bedrooms between 0 and 30),
  bathrooms int check (bathrooms between 0 and 30),
  land_sqm numeric check (land_sqm > 0),
  source_url text not null default '' check (source_url = '' or source_url ~* '^https?://'),
  note text not null default '' check (char_length(note) <= 2000),
  added_by text not null check (char_length(added_by) between 1 and 40),
  lat double precision not null check (lat between 5.5 and 20.5),
  lng double precision not null check (lng between 97.3 and 105.7),
  roof text check (roof in ('gable','hip','flat')),
  facing text check (facing in ('N','NE','E','SE','S','SW','W','NW')),
  footprint_w numeric check (footprint_w > 0),
  footprint_d numeric check (footprint_d > 0),
  version int not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.app_secret (code_hash text not null);

alter table public.parcels enable row level security;
alter table public.app_secret enable row level security;
revoke all on public.parcels from anon, authenticated;
revoke all on public.app_secret from anon, authenticated;

create unique index if not exists app_secret_single on public.app_secret ((true));

create or replace function public._check_code(p_code text)
returns void language plpgsql security definer
set search_path = public, extensions as $$
begin
  if p_code is null or p_code = ''
     or not exists (select 1 from public.app_secret where code_hash = crypt(p_code, code_hash)) then
    perform pg_sleep(1); -- slow down guessing
    raise exception 'bad_code';
  end if;
end $$;

create or replace function public.ping() returns text
language sql security definer set search_path = public as $$ select 'ok'::text $$;

create or replace function public.list_parcels(p_code text)
returns setof public.parcels language plpgsql security definer
set search_path = public, extensions as $$
begin
  perform public._check_code(p_code);
  return query select * from public.parcels order by created_at desc;
end $$;

create or replace function public.save_parcel(p_code text, p_parcel jsonb, p_expected_version int)
returns public.parcels language plpgsql security definer
set search_path = public, extensions as $$
declare r public.parcels;
begin
  perform public._check_code(p_code);
  if p_expected_version is null then
    insert into public.parcels (id, type, name, price_baht, usable_sqm, floors, bedrooms, bathrooms,
      land_sqm, source_url, note, added_by, lat, lng, roof, facing, footprint_w, footprint_d)
    values (
      coalesce((p_parcel->>'id')::uuid, gen_random_uuid()),
      p_parcel->>'type', p_parcel->>'name', (p_parcel->>'price_baht')::bigint,
      (p_parcel->>'usable_sqm')::numeric, (p_parcel->>'floors')::int,
      (p_parcel->>'bedrooms')::int, (p_parcel->>'bathrooms')::int,
      (p_parcel->>'land_sqm')::numeric, coalesce(p_parcel->>'source_url', ''),
      coalesce(p_parcel->>'note', ''), p_parcel->>'added_by',
      (p_parcel->>'lat')::float8, (p_parcel->>'lng')::float8,
      p_parcel->>'roof', p_parcel->>'facing',
      (p_parcel->>'footprint_w')::numeric, (p_parcel->>'footprint_d')::numeric)
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
    version = version + 1
  where id = (p_parcel->>'id')::uuid and version = p_expected_version and deleted_at is null
  returning * into r;
  if not found then raise exception 'conflict'; end if;
  return r;
end $$;

create or replace function public.set_deleted(p_code text, p_id uuid, p_deleted boolean, p_expected_version int)
returns public.parcels language plpgsql security definer
set search_path = public, extensions as $$
declare r public.parcels;
begin
  perform public._check_code(p_code);
  update public.parcels
     set deleted_at = case when p_deleted then now() else null end, version = version + 1
   where id = p_id and version = p_expected_version
  returning * into r;
  if not found then raise exception 'conflict'; end if;
  return r;
end $$;

revoke all on function public._check_code(text) from public, anon, authenticated;
revoke all on function public.ping() from public;
revoke all on function public.list_parcels(text) from public;
revoke all on function public.save_parcel(text, jsonb, int) from public;
revoke all on function public.set_deleted(text, uuid, boolean, int) from public;
grant execute on function public.ping() to anon;
grant execute on function public.list_parcels(text) to anon;
grant execute on function public.save_parcel(text, jsonb, int) to anon;
grant execute on function public.set_deleted(text, uuid, boolean, int) to anon;
