-- ============================================================================
--  Org-admin member management RPCs
--  Run this in the Supabase SQL editor (after 20260628000000_org_roles_and_admin).
--
--  Problem: an organisation admin updating another member's profile
--  (approve / reject / remove) is blocked by the combination of the
--  `protect_profile_columns` guard trigger and the profiles RLS WITH CHECK,
--  producing:  "new row violates row-level security policy for table profiles".
--
--  Fix: expose two SECURITY DEFINER functions that
--    1. verify the caller is an APPROVED org_admin,
--    2. verify the target member belongs to the caller's OWN organisation,
--    3. bypass the column guard (via the existing GUC flag) and apply the change.
--  Being SECURITY DEFINER they run as the function owner, so RLS WITH CHECK on
--  `profiles` is not evaluated against the caller. Authorisation is enforced
--  explicitly inside each function instead.
-- ============================================================================

-- ── Approve / reject / re-set a member's status ─────────────────────────────
create or replace function public.org_set_member_status(p_user uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_org  uuid;
  v_target_org uuid;
begin
  if p_status not in ('approved', 'rejected', 'pending') then
    raise exception 'invalid status %', p_status;
  end if;

  if not public.is_org_admin() then
    raise exception 'not authorised';
  end if;

  if p_user = auth.uid() then
    raise exception 'you cannot change your own status';
  end if;

  select organisation_id into v_admin_org  from public.profiles where id = auth.uid();
  select organisation_id into v_target_org from public.profiles where id = p_user;

  if v_admin_org is null
     or v_target_org is null
     or v_admin_org is distinct from v_target_org then
    raise exception 'member is not in your organisation';
  end if;

  perform set_config('app.bypass_profile_guard', 'on', true);
  update public.profiles set status = p_status where id = p_user;
  perform set_config('app.bypass_profile_guard', 'off', true);
end;
$$;

-- ── Remove a member from the organisation ───────────────────────────────────
create or replace function public.org_remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_org  uuid;
  v_target_org uuid;
begin
  if not public.is_org_admin() then
    raise exception 'not authorised';
  end if;

  if p_user = auth.uid() then
    raise exception 'you cannot remove yourself';
  end if;

  select organisation_id into v_admin_org  from public.profiles where id = auth.uid();
  select organisation_id into v_target_org from public.profiles where id = p_user;

  if v_admin_org is null
     or v_target_org is null
     or v_admin_org is distinct from v_target_org then
    raise exception 'member is not in your organisation';
  end if;

  perform set_config('app.bypass_profile_guard', 'on', true);
  update public.profiles
  set organisation_id = null, org_role = null
  where id = p_user;
  perform set_config('app.bypass_profile_guard', 'off', true);
end;
$$;

grant execute on function public.org_set_member_status(uuid, text) to authenticated;
grant execute on function public.org_remove_member(uuid)          to authenticated;
