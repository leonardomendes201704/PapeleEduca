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

-- Public heartbeats go through POST /api/metrics/presence (service role).
-- Admin app reads this table with the authenticated session.
grant select on public.site_presence to authenticated;

drop policy if exists "Anyone can upsert site presence" on public.site_presence;
drop policy if exists "Anyone can insert site presence" on public.site_presence;
drop policy if exists "Anyone can update site presence" on public.site_presence;

drop policy if exists "Admins can read site presence" on public.site_presence;
create policy "Admins can read site presence"
on public.site_presence
for select
to authenticated
using (public.is_admin(auth.uid()));

-- Historical unique visitors (distinct visitor_id across event tables + presence).
create or replace function public.get_unique_visitor_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  total integer := 0;
begin
  if auth.role() is distinct from 'service_role'
     and not public.is_admin(auth.uid()) then
    raise exception 'not allowed';
  end if;

  select count(*)::int into total
  from (
    select visitor_id from public.product_events where visitor_id <> ''
    union
    select visitor_id from public.blog_post_events where visitor_id <> ''
    union
    select visitor_id from public.blog_listing_events where visitor_id <> ''
    union
    select visitor_id from public.free_material_events where visitor_id <> ''
    union
    select visitor_id from public.home_page_events where visitor_id <> ''
    union
    select visitor_id from public.site_presence where visitor_id <> ''
  ) u;

  return coalesce(total, 0);
end;
$$;

revoke all on function public.get_unique_visitor_count() from public;
grant execute on function public.get_unique_visitor_count() to authenticated;
grant execute on function public.get_unique_visitor_count() to service_role;

-- Optional cleanup helper (manual or cron): delete stale rows older than 7 days
-- delete from public.site_presence where last_seen_at < now() - interval '7 days';
