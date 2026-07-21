-- Relatório periódico de métricas por e-mail
-- Execute no SQL Editor do Supabase (uma vez).

alter table public.site_settings
  add column if not exists metrics_email_enabled boolean not null default false;

alter table public.site_settings
  add column if not exists metrics_email_recipients text not null default '';

alter table public.site_settings
  add column if not exists metrics_email_time text not null default '08:00';

alter table public.site_settings
  add column if not exists metrics_email_last_sent_at timestamptz;

alter table public.site_settings
  add column if not exists metrics_email_last_error text not null default '';

comment on column public.site_settings.metrics_email_enabled is
  'Quando true, o cron da Vercel dispara o relatório no horário configurado (BRT).';
comment on column public.site_settings.metrics_email_recipients is
  'Destinatários separados por vírgula ou quebra de linha.';
comment on column public.site_settings.metrics_email_time is
  'Horário de envio no fuso America/Sao_Paulo, formato HH:MM.';

create or replace function public.get_metrics_email_snapshot(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'period', jsonb_build_object(
      'from', p_from,
      'to', p_to
    ),
    'products', jsonb_build_object(
      'views', (
        select count(*)::int from public.product_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_type = 'view'
      ),
      'unique_visitors', (
        select count(distinct e.visitor_id)::int from public.product_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_type = 'view'
      ),
      'opens', (
        select count(*)::int from public.product_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_type = 'open'
      ),
      'buy_clicks', (
        select count(*)::int from public.product_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_type = 'buy_click'
      )
    ),
    'free_materials', jsonb_build_object(
      'views', (
        select count(*)::int from public.free_material_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_type = 'view'
      ),
      'unique_visitors', (
        select count(distinct e.visitor_id)::int from public.free_material_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_type = 'view'
      ),
      'downloads', (
        select count(*)::int from public.free_material_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_type = 'download'
      )
    ),
    'blog', jsonb_build_object(
      'listing_views', (
        select count(*)::int from public.blog_listing_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_type = 'view'
      ),
      'post_views', (
        select count(*)::int from public.blog_post_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_type = 'view'
      ),
      'unique_readers', (
        select count(distinct e.visitor_id)::int from public.blog_post_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_type = 'view'
      ),
      'read_completes', (
        select count(*)::int from public.blog_post_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_type = 'read_complete'
      )
    ),
    'top_products', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.buy_clicks desc, t.views desc)
      from (
        select
          p.title,
          coalesce(p.category, '') as category,
          count(*) filter (where e.event_type = 'view')::int as views,
          count(*) filter (where e.event_type = 'open')::int as opens,
          count(*) filter (where e.event_type = 'buy_click')::int as buy_clicks
        from public.product_events e
        join public.products p on p.id = e.product_id
        where e.created_at >= p_from and e.created_at < p_to
        group by p.id, p.title, p.category
        having count(*) > 0
        order by buy_clicks desc, views desc
        limit 8
      ) t
    ), '[]'::jsonb),
    'top_free_materials', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.downloads desc, t.views desc)
      from (
        select
          m.title,
          coalesce(m.category, '') as category,
          count(*) filter (where e.event_type = 'view')::int as views,
          count(*) filter (where e.event_type = 'download')::int as downloads
        from public.free_material_events e
        join public.free_materials m on m.id = e.free_material_id
        where e.created_at >= p_from and e.created_at < p_to
        group by m.id, m.title, m.category
        having count(*) > 0
        order by downloads desc, views desc
        limit 8
      ) t
    ), '[]'::jsonb),
    'top_blog_posts', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.views desc, t.read_completes desc)
      from (
        select
          bp.title,
          coalesce(bc.name, '') as category,
          count(*) filter (where e.event_type = 'view')::int as views,
          count(*) filter (where e.event_type = 'read_complete')::int as read_completes
        from public.blog_post_events e
        join public.blog_posts bp on bp.id = e.blog_post_id
        left join public.blog_categories bc on bc.id = bp.category_id
        where e.created_at >= p_from and e.created_at < p_to
        group by bp.id, bp.title, bc.name
        having count(*) > 0
        order by views desc, read_completes desc
        limit 8
      ) t
    ), '[]'::jsonb),
    'lifetime', jsonb_build_object(
      'products', jsonb_build_object(
        'views', coalesce((select sum(views)::int from public.product_metrics_report), 0),
        'buy_clicks', coalesce((select sum(buy_clicks)::int from public.product_metrics_report), 0),
        'opens', coalesce((select sum(opens)::int from public.product_metrics_report), 0)
      ),
      'free_materials', jsonb_build_object(
        'views', coalesce((select sum(views)::int from public.free_material_metrics_report), 0),
        'downloads', coalesce((select sum(downloads)::int from public.free_material_metrics_report), 0)
      ),
      'blog', jsonb_build_object(
        'listing_views', coalesce((
          select views::int from public.blog_listing_metrics_report limit 1
        ), 0),
        'post_views', coalesce((select sum(views)::int from public.blog_post_metrics_report), 0),
        'read_completes', coalesce((select sum(read_completes)::int from public.blog_post_metrics_report), 0)
      )
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_metrics_email_snapshot(timestamptz, timestamptz) from public;
grant execute on function public.get_metrics_email_snapshot(timestamptz, timestamptz) to service_role;
