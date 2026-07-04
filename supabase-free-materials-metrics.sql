-- Run this in the Supabase SQL editor to enable free material download metrics.
-- Safe to run on an existing project.

create table if not exists public.free_material_events (
  id uuid primary key default gen_random_uuid(),
  free_material_id uuid not null references public.free_materials (id) on delete cascade,
  event_type text not null check (event_type in ('view', 'download')),
  visitor_id text not null,
  session_id text not null,
  source text not null default 'site',
  pathname text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.free_material_events enable row level security;

drop policy if exists "Anyone can insert free material events" on public.free_material_events;
create policy "Anyone can insert free material events"
on public.free_material_events
for insert
with check (
  event_type in ('view', 'download')
  and visitor_id <> ''
  and session_id <> ''
);

drop policy if exists "Admins can read free material events" on public.free_material_events;
create policy "Admins can read free material events"
on public.free_material_events
for select
using (public.is_admin(auth.uid()));

create index if not exists free_material_events_material_created_idx
on public.free_material_events (free_material_id, created_at desc);

create index if not exists free_material_events_type_created_idx
on public.free_material_events (event_type, created_at desc);

create or replace view public.free_material_metrics_report as
select
  fm.id,
  fm.title,
  fm.category,
  fm.file_type,
  fm.status,
  fm.sort_order,
  coalesce(count(*) filter (where e.event_type = 'view'), 0)::int as views,
  coalesce(count(distinct e.session_id) filter (where e.event_type = 'view'), 0)::int as unique_views,
  coalesce(count(*) filter (where e.event_type = 'download'), 0)::int as downloads,
  max(e.created_at) as last_event_at
from public.free_materials fm
left join public.free_material_events e
  on e.free_material_id = fm.id
group by fm.id;

grant select on public.free_material_metrics_report to authenticated;
