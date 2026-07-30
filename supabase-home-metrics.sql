-- Home page views (/ and /index.html)
-- Run once in Supabase SQL Editor. Safe to re-run.

create table if not exists public.home_page_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('view')),
  visitor_id text not null,
  session_id text not null,
  source text not null default 'site',
  pathname text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.home_page_events enable row level security;

grant insert on public.home_page_events to anon, authenticated;
grant select on public.home_page_events to authenticated;

drop policy if exists "Anyone can insert home page events" on public.home_page_events;
create policy "Anyone can insert home page events"
on public.home_page_events
for insert
with check (
  event_type = 'view'
  and visitor_id <> ''
  and session_id <> ''
);

drop policy if exists "Admins can read home page events" on public.home_page_events;
create policy "Admins can read home page events"
on public.home_page_events
for select
using (public.is_admin(auth.uid()));

create index if not exists home_page_events_created_idx
  on public.home_page_events (created_at desc);

create index if not exists home_page_events_visitor_idx
  on public.home_page_events (visitor_id);

create or replace view public.home_page_metrics_report as
select
  coalesce(count(*), 0)::int as views,
  coalesce(count(distinct visitor_id), 0)::int as unique_views,
  max(created_at) as last_event_at
from public.home_page_events
where event_type = 'view';

grant select on public.home_page_metrics_report to authenticated;

-- Refresh unique-visitor RPC to include home (safe if function already exists).
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
