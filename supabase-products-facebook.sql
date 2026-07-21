-- Facebook share tracking for products
-- Run in Supabase SQL Editor. Safe to re-run.

alter table public.products
  add column if not exists facebook_post_id text not null default '',
  add column if not exists facebook_posted_at timestamptz;

comment on column public.products.facebook_post_id is
  'Graph API post id returned after publishing the product link to the Facebook Page';
comment on column public.products.facebook_posted_at is
  'Timestamp of the last successful Facebook Page publish for this product';

create index if not exists product_events_source_idx
  on public.product_events (source);

create index if not exists product_events_utm_source_idx
  on public.product_events ((metadata->>'utm_source'));

create or replace view public.product_metrics_report as
select
  p.id,
  p.title,
  p.slug,
  p.category,
  p.price,
  p.promo_price,
  p.status,
  p.featured,
  p.images,
  coalesce(count(*) filter (where e.event_type = 'view'), 0)::int as views,
  coalesce(count(distinct e.session_id) filter (where e.event_type = 'view'), 0)::int as unique_views,
  coalesce(count(*) filter (
    where e.event_type = 'view'
      and (
        e.source = 'facebook'
        or lower(coalesce(e.metadata->>'utm_source', '')) = 'facebook'
      )
  ), 0)::int as facebook_views,
  coalesce(count(*) filter (where e.event_type = 'open'), 0)::int as opens,
  coalesce(count(*) filter (where e.event_type = 'buy_click'), 0)::int as buy_clicks,
  coalesce(count(*) filter (
    where e.event_type = 'buy_click'
      and (
        e.source = 'facebook'
        or lower(coalesce(e.metadata->>'utm_source', '')) = 'facebook'
      )
  ), 0)::int as facebook_buy_clicks,
  max(e.created_at) as last_event_at
from public.products p
left join public.product_events e
  on e.product_id = p.id
group by p.id;

grant select on public.product_metrics_report to authenticated;
