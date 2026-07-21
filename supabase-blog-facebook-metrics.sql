-- Facebook attribution metrics for blog posts
-- Run in Supabase SQL Editor after supabase-blog-metrics.sql. Safe to re-run.

create index if not exists blog_post_events_source_idx
  on public.blog_post_events (source);

create index if not exists blog_post_events_utm_source_idx
  on public.blog_post_events ((metadata->>'utm_source'));

-- CREATE OR REPLACE cannot insert/reorder columns mid-view; drop first.
drop view if exists public.blog_post_metrics_report;

create view public.blog_post_metrics_report as
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
  coalesce(count(*) filter (where e.event_type = 'read_complete'), 0)::int as read_completes,
  coalesce(count(distinct e.session_id) filter (where e.event_type = 'read_complete'), 0)::int as unique_reads,
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
  max(e.created_at) as last_event_at,
  coalesce(count(*) filter (
    where e.event_type = 'view'
      and (
        e.source = 'facebook'
        or lower(coalesce(e.metadata->>'utm_source', '')) = 'facebook'
      )
  ), 0)::int as facebook_views,
  coalesce(count(*) filter (
    where e.event_type = 'read_complete'
      and (
        e.source = 'facebook'
        or lower(coalesce(e.metadata->>'utm_source', '')) = 'facebook'
      )
  ), 0)::int as facebook_reads
from public.blog_posts p
left join public.blog_categories c on c.id = p.category_id
left join public.blog_post_events e on e.blog_post_id = p.id
group by p.id, c.name;

grant select on public.blog_post_metrics_report to authenticated;
