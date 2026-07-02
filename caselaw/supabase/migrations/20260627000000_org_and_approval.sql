-- ============================================================================
--  Organisations / referral invites  +  Signup approval
--  Run this in the Supabase SQL editor.
--
--  NOTE: If you already have a `public.handle_new_user()` trigger on
--  auth.users that creates profile rows, MERGE the org/status logic from the
--  version below into your existing function instead of blindly replacing it.
-- ============================================================================

-- ── 1. Organisations (created only by the platform admin) ───────────────────
create table if not exists public.organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- ── 2. Referral / invite tokens ─────────────────────────────────────────────
create table if not exists public.invite_tokens (
  token            uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  created_at       timestamptz not null default now(),
  used_at          timestamptz,
  used_by          uuid references auth.users(id)
);

-- ── 3. Profile columns ──────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists organisation_id uuid references public.organisations(id),
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected'));

-- ── 4. Helper: is the current user an admin? (avoids RLS recursion) ──────────
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ── 5. Protect privileged profile columns from self-editing ─────────────────
--  Non-admin users cannot change organisation_id / status / role.
--  A SECURITY DEFINER function may bypass this guard by setting the GUC flag.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.bypass_profile_guard', true) = 'on' then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  new.organisation_id := old.organisation_id;
  new.status          := old.status;
  new.role            := old.role;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ── 6. Assign org + status on signup (email/password via user_metadata) ──────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_org   uuid;
begin
  begin
    v_token := (new.raw_user_meta_data ->> 'invite_token')::uuid;
  exception when others then
    v_token := null;
  end;

  if v_token is not null then
    select organisation_id into v_org
    from public.invite_tokens
    where token = v_token and used_at is null;

    if v_org is not null then
      update public.invite_tokens
      set used_at = now(), used_by = new.id
      where token = v_token;
    end if;
  end if;

  insert into public.profiles (id, first_name, last_name, username, avatar_url, organisation_id, status)
  values (
    new.id,
    new.raw_user_meta_data ->> 'given_name',
    new.raw_user_meta_data ->> 'family_name',
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    v_org,
    'pending'
  )
  on conflict (id) do update set
    organisation_id = coalesce(public.profiles.organisation_id, excluded.organisation_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 7. Claim an invite after login (used for OAuth/Google signups) ──────────
create or replace function public.claim_invite(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organisation_id into v_org
  from public.invite_tokens
  where token = p_token and used_at is null;

  if v_org is null then
    return;
  end if;

  perform set_config('app.bypass_profile_guard', 'on', true);
  update public.profiles
  set organisation_id = v_org
  where id = auth.uid() and organisation_id is null;
  perform set_config('app.bypass_profile_guard', 'off', true);

  update public.invite_tokens
  set used_at = now(), used_by = auth.uid()
  where token = p_token;
end;
$$;

grant execute on function public.claim_invite(uuid) to authenticated;

-- ── 8. Public lookup of an invite's org name (for the register page) ────────
create or replace function public.get_invite_org(p_token uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select o.name
  from public.invite_tokens t
  join public.organisations o on o.id = t.organisation_id
  where t.token = p_token and t.used_at is null;
$$;

grant execute on function public.get_invite_org(uuid) to anon, authenticated;

-- ── 9. Row Level Security ───────────────────────────────────────────────────
alter table public.organisations enable row level security;
alter table public.invite_tokens enable row level security;

-- Any authenticated user can read organisation names (to show their own org).
drop policy if exists "org read" on public.organisations;
create policy "org read" on public.organisations
  for select to authenticated using (true);

-- Only admins manage organisations.
drop policy if exists "org admin write" on public.organisations;
create policy "org admin write" on public.organisations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Only admins manage invite tokens.
drop policy if exists "invite admin" on public.invite_tokens;
create policy "invite admin" on public.invite_tokens
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admins can update any profile (needed for approve / reject).
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
