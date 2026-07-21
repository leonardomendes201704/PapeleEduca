-- Blog post metrics. Run in Supabase SQL Editor.

create table if not exists public.blog_post_events (
  id uuid primary key default gen_random_uuid(),
  blog_post_id uuid not null references public.blog_posts (id) on delete cascade,
  event_type text not null check (event_type in ('view', 'read_complete')),
  visitor_id text not null,
  session_id text not null,
  source text not null default 'site',
  pathname text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.blog_post_events enable row level security;

grant insert on public.blog_post_events to anon, authenticated;
grant select on public.blog_post_events to authenticated;

drop policy if exists "Anyone can insert blog post events" on public.blog_post_events;
create policy "Anyone can insert blog post events"
on public.blog_post_events
for insert
with check (
  event_type in ('view', 'read_complete')
  and visitor_id <> ''
  and session_id <> ''
);

drop policy if exists "Admins can read blog post events" on public.blog_post_events;
create policy "Admins can read blog post events"
on public.blog_post_events
for select
using (public.is_admin(auth.uid()));

create index if not exists blog_post_events_post_created_idx
on public.blog_post_events (blog_post_id, created_at desc);

create index if not exists blog_post_events_type_created_idx
on public.blog_post_events (event_type, created_at desc);

create index if not exists blog_post_events_source_idx
on public.blog_post_events (source);

create index if not exists blog_post_events_utm_source_idx
on public.blog_post_events ((metadata->>'utm_source'));

create or replace view public.blog_post_metrics_report as
select
  p.id,
  p.title,
  p.slug,
  p.status,
  p.cover_url,
  p.published_at,
  c.name as category,
  coalesce(count(*) filter (where e.event_type = 'view'), 0)::int as views,
  coalesce(count(distinct e.session_id) filter (where e.event_type = 'view'), 0)::int as unique_views,
  coalesce(count(*) filter (
    where e.event_type = 'view'
      and (
        e.source = 'facebook'
        or lower(coalesce(e.metadata->>'utm_source', '')) = 'facebook'
      )
  ), 0)::int as facebook_views,
  coalesce(count(*) filter (where e.event_type = 'read_complete'), 0)::int as read_completes,
  coalesce(count(distinct e.session_id) filter (where e.event_type = 'read_complete'), 0)::int as unique_reads,
  coalesce(count(*) filter (
    where e.event_type = 'read_complete'
      and (
        e.source = 'facebook'
        or lower(coalesce(e.metadata->>'utm_source', '')) = 'facebook'
      )
  ), 0)::int as facebook_reads,
  case
    when coalesce(count(*) filter (where e.event_type = 'view'), 0) > 0
      then round(
        (
          coalesce(count(*) filter (where e.event_type = 'read_complete'), 0)::numeric
          / count(*) filter (where e.event_type = 'view')
        ) * 100,
        1
      )
    else 0
  end as read_rate,
  max(e.created_at) as last_event_at
from public.blog_posts p
left join public.blog_categories c on c.id = p.category_id
left join public.blog_post_events e on e.blog_post_id = p.id
group by p.id, c.name;

grant select on public.blog_post_metrics_report to authenticated;

-- Listing page visits (/blog, /blog.html)

create table if not exists public.blog_listing_events (
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

alter table public.blog_listing_events enable row level security;

grant insert on public.blog_listing_events to anon, authenticated;
grant select on public.blog_listing_events to authenticated;

drop policy if exists "Anyone can insert blog listing events" on public.blog_listing_events;
create policy "Anyone can insert blog listing events"
on public.blog_listing_events
for insert
with check (
  event_type = 'view'
  and visitor_id <> ''
  and session_id <> ''
);

drop policy if exists "Admins can read blog listing events" on public.blog_listing_events;
create policy "Admins can read blog listing events"
on public.blog_listing_events
for select
using (public.is_admin(auth.uid()));

create index if not exists blog_listing_events_created_idx
on public.blog_listing_events (created_at desc);

create or replace view public.blog_listing_metrics_report as
select
  coalesce(count(*), 0)::int as views,
  coalesce(count(distinct session_id), 0)::int as unique_views,
  max(created_at) as last_event_at
from public.blog_listing_events
where event_type = 'view';

grant select on public.blog_listing_metrics_report to authenticated;
