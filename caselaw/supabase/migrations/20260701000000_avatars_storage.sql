-- ============================================================================
--  Fix: "Avatar upload failed: new row violates row-level security policy".
--
--  Cause: the `avatars` storage bucket and its RLS policies were never
--  created, so authenticated users cannot write to storage.objects.
--
--  The app uploads avatars to the path `<auth.uid>/avatar.<ext>`, so each
--  user may only manage files inside a folder named after their own UID.
--
--  Run this in the Supabase SQL editor.
-- ============================================================================

-- ── 1. Create the public `avatars` bucket (idempotent) ──────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- ── 2. RLS policies on storage.objects for the `avatars` bucket ─────────────
--  Folder convention: (storage.foldername(name))[1] is the owner's UID.

-- Public read access (bucket is public; this also allows listing).
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Authenticated users can upload into their own folder.
drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can overwrite/update files in their own folder.
drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete files in their own folder.
drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
