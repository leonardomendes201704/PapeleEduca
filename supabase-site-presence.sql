-- Site presence / "visitantes online"
-- Run once in Supabase SQL Editor. Safe to re-run.
--
-- Clients upsert last_seen_at every ~45s while the tab is visible.
-- Admin app counts rows with last_seen_at within the last 2 minutes.

create table if not exists public.site_presence (
  visitor_id text primary key,
  session_id text not null default '',
  pathname text,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_presence_last_seen_idx
  on public.site_presence (last_seen_at desc);

alter table public.site_presence enable row level security;

drop policy if exists "Anyone can upsert site presence" on public.site_presence;
create policy "Anyone can insert site presence"
on public.site_presence
for insert
with check (visitor_id <> '');

drop policy if exists "Anyone can update site presence" on public.site_presence;
create policy "Anyone can update site presence"
on public.site_presence
for update
using (visitor_id <> '')
with check (visitor_id <> '');

drop policy if exists "Admins can read site presence" on public.site_presence;
create policy "Admins can read site presence"
on public.site_presence
for select
using (public.is_admin(auth.uid()));

-- Optional cleanup helper (manual or cron): delete stale rows older than 7 days
-- delete from public.site_presence where last_seen_at < now() - interval '7 days';
