-- ============================================================================
--  Fix: platform admin cannot delete a user ("Database error deleting user").
--
--  Cause: foreign keys that reference auth.users (directly or via profiles)
--  were created without ON DELETE behaviour, so removing the auth user is
--  blocked by dependent rows in public.profiles / public.invite_tokens.
--
--  Run this in the Supabase SQL editor.
-- ============================================================================

-- ── 1. profiles.id -> auth.users(id) must cascade on delete ─────────────────
--  Drop whatever FK currently links profiles.id to auth.users, then re-create
--  it with ON DELETE CASCADE so deleting the auth user removes the profile.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype  = 'f'
    and confrelid = 'auth.users'::regclass
  limit 1;

  if v_conname is not null then
    execute format('alter table public.profiles drop constraint %I', v_conname);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users(id) on delete cascade;

-- ── 2. invite_tokens.used_by -> keep the token row, just null the user ──────
alter table public.invite_tokens
  drop constraint if exists invite_tokens_used_by_fkey;

alter table public.invite_tokens
  add constraint invite_tokens_used_by_fkey
  foreign key (used_by) references auth.users(id) on delete set null;
