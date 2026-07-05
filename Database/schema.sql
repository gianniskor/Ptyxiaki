-- ============================================================================
-- Full database schema (single-file restore)
-- ============================================================================
-- Run this file once against a fresh Supabase/Postgres database to recreate
-- the public schema objects used by the application.
--
-- Object order is dependency-safe:
--   1. Tables & indexes
--   2. Functions (referenced by triggers and RLS policies)
--   3. Triggers (public tables + auth.users)
--   4. Row Level Security + policies
--   5. Grants
--
-- Idempotent where practical (drop trigger if exists, create or replace function).
-- ============================================================================


-- ============================================================================
-- 1. TABLES & INDEXES
-- ============================================================================

create table if not exists public.organisations (
  id uuid not null default gen_random_uuid (),
  name text not null,
  created_at timestamp with time zone not null default now(),
  constraint organisations_pkey primary key (id),
  constraint organisations_name_key unique (name)
) TABLESPACE pg_default;

create table if not exists public.profiles (
  id uuid not null,
  updated_at timestamp with time zone null,
  username text null,
  avatar_url text null,
  phone text null,
  first_name text null,
  last_name text null,
  role text not null default 'user'::text,
  organisation_id uuid null,
  status text not null default 'pending'::text,
  org_role text null,
  constraint profiles_pkey primary key (id),
  constraint profiles_username_key unique (username),
  constraint profiles_organisation_id_fkey foreign KEY (organisation_id) references organisations (id),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE,
  constraint profiles_org_role_check check (
    (
      org_role = any (array['org_admin'::text, 'member'::text])
    )
  ),
  constraint profiles_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'approved'::text,
          'rejected'::text
        ]
      )
    )
  ),
  constraint username_length check ((char_length(username) >= 3))
) TABLESPACE pg_default;

create table if not exists public.invite_tokens (
  token uuid not null default gen_random_uuid (),
  organisation_id uuid not null,
  created_at timestamp with time zone not null default now(),
  used_at timestamp with time zone null,
  used_by uuid null,
  constraint invite_tokens_pkey primary key (token),
  constraint invite_tokens_organisation_id_fkey foreign KEY (organisation_id) references organisations (id) on delete CASCADE,
  constraint invite_tokens_used_by_fkey foreign KEY (used_by) references auth.users (id)
) TABLESPACE pg_default;

create table if not exists public.recent_searches (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  term text not null,
  created_at timestamp with time zone not null default now(),
  constraint recent_searches_pkey primary key (id),
  constraint recent_searches_user_id_term_key unique (user_id, term),
  constraint recent_searches_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists recent_searches_user_created_idx on public.recent_searches using btree (user_id, created_at desc) TABLESPACE pg_default;


-- ============================================================================
-- 2. FUNCTIONS
-- ============================================================================

-- --- Helper functions (used by RLS policies and guards) ---------------------

create or replace function public.get_my_role()
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_catalog'
as $function$
  select role from public.profiles where id = auth.uid();
$function$
;

create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$function$
;

create or replace function public.is_org_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and org_role = 'org_admin'
      and status = 'approved'
  );
$function$
;

create or replace function public.my_org()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select organisation_id from public.profiles where id = auth.uid();
$function$
;

create or replace function public.get_user_count()
 returns bigint
 language sql
 stable security definer
 set search_path to 'public', 'pg_catalog'
as $function$
  select count(*) from auth.users;
$function$
;

create or replace function public.get_invite_org(p_token uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select o.name
  from public.invite_tokens t
  join public.organisations o on o.id = t.organisation_id
  where t.token = p_token and t.used_at is null;
$function$
;

-- --- Trigger functions ------------------------------------------------------

create or replace function public.protect_profile_columns()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$
;

create or replace function public.trim_recent_searches()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  delete from public.recent_searches
  where user_id = new.user_id
    and id not in (
      select id
      from public.recent_searches
      where user_id = new.user_id
      order by created_at desc
      limit 5
    );
  return null;
end;
$function$
;

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$
;

-- --- RPC functions (called from the application) ----------------------------

create or replace function public.claim_invite(p_token uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$
;

create or replace function public.org_remove_member(p_user uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$
;

create or replace function public.org_set_member_status(p_user uuid, p_status text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$
;


-- ============================================================================
-- 3. TRIGGERS
-- ============================================================================

drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile before update on public.profiles
  for each row execute function public.protect_profile_columns();

drop trigger if exists trim_recent_searches_trigger on public.recent_searches;
create trigger trim_recent_searches_trigger after insert on public.recent_searches
  for each row execute function public.trim_recent_searches();

-- Auth trigger: auto-create a profile row on new signup. Not recreated by
-- Supabase Auth automatically, so it must be restored here.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- 4. ROW LEVEL SECURITY + POLICIES
-- ============================================================================

-- --- organisations ----------------------------------------------------------

alter table public.organisations enable row level security;

create policy "org admin write" on public.organisations
  as permissive for all to authenticated
  using (is_admin())
  with check (is_admin());

create policy "org read" on public.organisations
  as permissive for select to authenticated
  using (true);

-- --- profiles ---------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "Admins can read all profiles" on public.profiles
  as permissive for select to public
  using (((id = auth.uid()) OR (get_my_role() = 'admin'::text)));

create policy "Users can insert own profile" on public.profiles
  as permissive for insert to public
  with check ((auth.uid() = id));

create policy "Users can update own profile" on public.profiles
  as permissive for update to public
  using ((auth.uid() = id));

create policy "Users can view own profile" on public.profiles
  as permissive for select to public
  using ((auth.uid() = id));

create policy "profiles admin update" on public.profiles
  as permissive for update to authenticated
  using (is_admin())
  with check (is_admin());

create policy "profiles org admin read" on public.profiles
  as permissive for select to authenticated
  using ((is_org_admin() AND (NOT (organisation_id IS DISTINCT FROM my_org()))));

create policy "profiles org admin update" on public.profiles
  as permissive for update to authenticated
  using ((is_org_admin() AND (NOT (organisation_id IS DISTINCT FROM my_org()))))
  with check ((is_org_admin() AND ((NOT (organisation_id IS DISTINCT FROM my_org())) OR (organisation_id IS NULL))));

-- --- invite_tokens ----------------------------------------------------------

alter table public.invite_tokens enable row level security;

create policy "invite manage" on public.invite_tokens
  as permissive for all to authenticated
  using ((is_admin() OR (is_org_admin() AND (NOT (organisation_id IS DISTINCT FROM my_org())))))
  with check ((is_admin() OR (is_org_admin() AND (NOT (organisation_id IS DISTINCT FROM my_org())))));

-- --- recent_searches --------------------------------------------------------

alter table public.recent_searches enable row level security;

create policy "Users can delete their own recent searches" on public.recent_searches
  as permissive for delete to authenticated
  using ((user_id = auth.uid()));

create policy "Users can insert their own recent searches" on public.recent_searches
  as permissive for insert to authenticated
  with check ((user_id = auth.uid()));

create policy "Users can read their own recent searches" on public.recent_searches
  as permissive for select to authenticated
  using ((user_id = auth.uid()));

create policy "Users can update their own recent searches" on public.recent_searches
  as permissive for update to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));


-- ============================================================================
-- 5. GRANTS
-- ============================================================================

grant delete, insert, references, select, trigger, truncate, update on public.organisations to anon;
grant delete, insert, references, select, trigger, truncate, update on public.organisations to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.organisations to postgres;
grant delete, insert, references, select, trigger, truncate, update on public.organisations to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.profiles to anon;
grant delete, insert, references, select, trigger, truncate, update on public.profiles to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.profiles to postgres;
grant delete, insert, references, select, trigger, truncate, update on public.profiles to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.invite_tokens to anon;
grant delete, insert, references, select, trigger, truncate, update on public.invite_tokens to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.invite_tokens to postgres;
grant delete, insert, references, select, trigger, truncate, update on public.invite_tokens to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.recent_searches to anon;
grant delete, insert, references, select, trigger, truncate, update on public.recent_searches to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.recent_searches to postgres;
grant delete, insert, references, select, trigger, truncate, update on public.recent_searches to service_role;
