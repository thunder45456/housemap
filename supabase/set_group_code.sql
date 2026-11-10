-- Set (or change) the group code. Run in Supabase → SQL Editor.
-- 1) Replace REPLACE_ME with your chosen code.
-- 2) Run it. 3) Do NOT save the real code back into this file or commit it.
-- Only the SHA-256 hash is stored in the database.

delete from public.app_secret;
insert into public.app_secret (code_hash)
values (encode(extensions.digest('REPLACE_ME', 'sha256'), 'hex'));
