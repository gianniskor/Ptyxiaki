-- ============================================================================
--  Organisation-level roles  +  org-admin management
--  Run this in the Supabase SQL editor (after 20260627000000_org_and_approval).
--
--  Adds a per-organisation role (`org_admin` / `member`) so that an
--  organisation administrator can:
--    * generate invite links for their own organisation,
--    * see the members of their organisation (including pending ones),
--    * approve / reject pending members,
--    * remove a member from their organisation.
--
--  The platform `admin` (profiles.role = 'admin') keeps full control.
-- ============================================================================

-- ── 1. Per-organisation role column ─────────────────────────────────────────
alter table public.profiles
  add column if not exists org_role text
    check (org_role in ('org_admin', 'member'));

-- ── 2. Helpers (security definer → no RLS recursion) ────────────────────────
create or replace function public.my_org()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select organisation_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_org_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and org_role = 'org_admin'
      and status = 'approved'
  );
$$;

grant execute on function public.my_org() to authenticated;
grant execute on function public.is_org_admin() to authenticated;

-- ── 3. Protect privileged columns, but let org admins manage their members ──
--  Non-admins cannot change organisation_id / status / role / org_role.
--  Org admins MAY change status / organisation_id / org_role of members that
--  belong to their own organisation, but can never grant the platform role.
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

  -- Org admins may manage members of their own organisation.
  if public.is_org_admin() and old.organisation_id is not distinct from public.my_org() then
    new.role := old.role;                 -- never escalate to platform admin
    -- org admins may not promote a member to org_admin of a different org,
    -- but may move/remove within their own org and toggle org_role/status.
    return new;
  end if;

  new.organisation_id := old.organisation_id;
  new.status          := old.status;
  new.role            := old.role;
  new.org_role        := old.org_role;
  return new;
end;
$$;

-- ── 4. RLS: org admins can read & update their organisation's members ───────
drop policy if exists "profiles org admin read" on public.profiles;
create policy "profiles org admin read" on public.profiles
  for select to authenticated
  using (public.is_org_admin() and organisation_id is not distinct from public.my_org());

drop policy if exists "profiles org admin update" on public.profiles;
create policy "profiles org admin update" on public.profiles
  for update to authenticated
  using (public.is_org_admin() and organisation_id is not distinct from public.my_org())
  with check (
    public.is_org_admin()
    and (organisation_id is not distinct from public.my_org() or organisation_id is null)
  );

-- ── 5. RLS: org admins can manage invite tokens for their own org ───────────
drop policy if exists "invite admin" on public.invite_tokens;
drop policy if exists "invite org admin" on public.invite_tokens;
create policy "invite manage" on public.invite_tokens
  for all to authenticated
  using (
    public.is_admin()
    or (public.is_org_admin() and organisation_id is not distinct from public.my_org())
  )
  with check (
    public.is_admin()
    or (public.is_org_admin() and organisation_id is not distinct from public.my_org())
  );
