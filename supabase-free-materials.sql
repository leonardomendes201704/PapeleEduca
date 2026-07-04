-- Run this in the Supabase SQL editor to enable free materials.
-- Safe to run on an existing project (uses IF NOT EXISTS / DROP POLICY IF EXISTS).

create table if not exists public.free_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null default '',
  file_type text not null default 'PDF',
  file_path text not null default '',
  file_url text not null default '',
  file_name text not null default '',
  cover_path text not null default '',
  cover_url text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.free_materials enable row level security;

grant select on public.free_materials to anon, authenticated;
grant insert, update, delete on public.free_materials to authenticated;

drop policy if exists "Public can read published free materials" on public.free_materials;
create policy "Public can read published free materials"
on public.free_materials
for select
using (status = 'published');

drop policy if exists "Admins can read all free materials" on public.free_materials;
create policy "Admins can read all free materials"
on public.free_materials
for select
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert free materials" on public.free_materials;
create policy "Admins can insert free materials"
on public.free_materials
for insert
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update free materials" on public.free_materials;
create policy "Admins can update free materials"
on public.free_materials
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete free materials" on public.free_materials;
create policy "Admins can delete free materials"
on public.free_materials
for delete
using (public.is_admin(auth.uid()));

create index if not exists free_materials_status_sort_idx
on public.free_materials (status, sort_order asc, created_at desc);

insert into storage.buckets (id, name, public)
values ('free-materials', 'free-materials', true)
on conflict (id) do nothing;

drop policy if exists "Public can read free materials files" on storage.objects;
create policy "Public can read free materials files"
on storage.objects
for select
using (bucket_id = 'free-materials');

drop policy if exists "Admins can upload free materials files" on storage.objects;
create policy "Admins can upload free materials files"
on storage.objects
for insert
with check (
  bucket_id = 'free-materials'
  and public.is_admin(auth.uid())
);

drop policy if exists "Admins can update free materials files" on storage.objects;
create policy "Admins can update free materials files"
on storage.objects
for update
using (
  bucket_id = 'free-materials'
  and public.is_admin(auth.uid())
)
with check (
  bucket_id = 'free-materials'
  and public.is_admin(auth.uid())
);

drop policy if exists "Admins can delete free materials files" on storage.objects;
create policy "Admins can delete free materials files"
on storage.objects
for delete
using (
  bucket_id = 'free-materials'
  and public.is_admin(auth.uid())
);
