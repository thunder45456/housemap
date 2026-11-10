-- Set (or change) the group code. Run in Supabase -> SQL Editor.
-- 1) Replace REPLACE_ME below with your chosen code (at least 8 characters).
-- 2) Run it. 3) Do NOT save the real code back into this file or commit it.
-- Only a salted bcrypt hash is stored in the database.

do $$
declare v_code text := 'REPLACE_ME';
begin
  if v_code = 'REPLACE_ME' or char_length(v_code) < 8 then
    raise exception 'Replace REPLACE_ME with your own group code (at least 8 characters) first';
  end if;
  delete from public.app_secret;
  insert into public.app_secret (code_hash) values (extensions.crypt(v_code, extensions.gen_salt('bf', 10)));
end $$;
