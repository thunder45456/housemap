-- Migration 2 (run ONCE on the existing project, in SQL Editor), then immediately run set_group_code.sql
-- with the same (or a new) group code. Until you do, the site rejects every code.
-- Changes: group code is verified against a salted bcrypt hash, wrong guesses are delayed 1 s,
-- and app_secret may hold only one row.

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

