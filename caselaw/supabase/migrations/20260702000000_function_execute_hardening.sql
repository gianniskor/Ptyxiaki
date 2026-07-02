-- ============================================================================
--  Security hardening: lock down EXECUTE privileges on SECURITY DEFINER and
--  privilege-check functions that were exposed too broadly.
--
--  Findings addressed:
--    * Trigger functions were callable via PostgREST RPC by anon/authenticated.
--    * Destructive org-management functions were callable by `anon`.
--    * Privilege-check helpers were callable by `anon`.
--
--  Run this in the Supabase SQL editor (after the earlier org migrations).
-- ============================================================================

-- ── 1. Trigger functions must never be callable via RPC ─────────────────────
--  These are only invoked by their triggers; revoke from both roles.
revoke execute on function public.handle_new_user()          from anon, authenticated;
revoke execute on function public.protect_profile_columns()  from anon, authenticated;

-- ── 2. Destructive org functions: never reachable by `anon` ─────────────────
--  They already enforce authorisation internally, but unauthenticated callers
--  should not be able to fire them at all.
revoke execute on function public.org_remove_member(uuid)         from anon;
revoke execute on function public.org_set_member_status(uuid, text) from anon;

-- ── 3. Privilege-check helpers: never reachable by `anon` ───────────────────
revoke execute on function public.is_admin()     from anon;
revoke execute on function public.is_org_admin() from anon;
revoke execute on function public.my_org()       from anon;

-- `get_my_role()` may not exist in every environment; guard the revoke.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_role'
  ) then
    execute 'revoke execute on function public.get_my_role() from anon';
  end if;
end $$;
