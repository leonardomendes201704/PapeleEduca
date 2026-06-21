-- Supabase schema for Papelê Educa
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

-- Profiles table to mark admin users
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
using (id = auth.uid() or public.is_admin(auth.uid()))
with check (id = auth.uid() or public.is_admin(auth.uid()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'editor'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null default '',
  category text not null default '',
  hotmart_url text not null default '',
  price numeric(10,2) not null default 0,
  promo_price numeric(10,2),
  promo_start date,
  promo_end date,
  published_at date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  images jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
add column if not exists hotmart_url text not null default '';

alter table public.products enable row level security;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'admin'
  );
$$;

create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  instagram_url text not null default '',
  facebook_url text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, instagram_url, facebook_url)
values (1, '', '')
on conflict (id) do nothing;

alter table public.site_settings enable row level security;
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

drop policy if exists "Anyone can read site settings" on public.site_settings;
create policy "Anyone can read site settings"
on public.site_settings
for select
using (true);

drop policy if exists "Admins can update site settings" on public.site_settings;
create policy "Admins can update site settings"
on public.site_settings
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert site settings" on public.site_settings;
create policy "Admins can insert site settings"
on public.site_settings
for insert
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete site settings" on public.site_settings;
create policy "Admins can delete site settings"
on public.site_settings
for delete
using (public.is_admin(auth.uid()));

drop policy if exists "Public can read published products" on public.products;
create policy "Public can read published products"
on public.products
for select
using (status = 'published');

drop policy if exists "Admins can read all products" on public.products;
create policy "Admins can read all products"
on public.products
for select
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products"
on public.products
for insert
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products"
on public.products
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products"
on public.products
for delete
using (public.is_admin(auth.uid()));

-- Storage bucket for product images
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "Public can read product images" on storage.objects;
create policy "Public can read product images"
on storage.objects
for select
using (bucket_id = 'product-images');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
on storage.objects
for insert
with check (
  bucket_id = 'product-images'
  and public.is_admin(auth.uid())
);

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
on storage.objects
for update
using (
  bucket_id = 'product-images'
  and public.is_admin(auth.uid())
)
with check (
  bucket_id = 'product-images'
  and public.is_admin(auth.uid())
);

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
on storage.objects
for delete
using (
  bucket_id = 'product-images'
  and public.is_admin(auth.uid())
);

-- Helpful index for admin listing
create index if not exists products_created_at_idx on public.products (created_at desc);
create index if not exists products_status_idx on public.products (status);

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  event_type text not null check (event_type in ('view', 'open', 'buy_click')),
  visitor_id text not null,
  session_id text not null,
  source text not null default 'site',
  pathname text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.product_events enable row level security;

drop policy if exists "Anyone can insert product events" on public.product_events;
create policy "Anyone can insert product events"
on public.product_events
for insert
with check (
  event_type in ('view', 'open', 'buy_click')
  and visitor_id <> ''
  and session_id <> ''
);

drop policy if exists "Admins can read product events" on public.product_events;
create policy "Admins can read product events"
on public.product_events
for select
using (public.is_admin(auth.uid()));

create index if not exists product_events_product_created_idx on public.product_events (product_id, created_at desc);
create index if not exists product_events_type_created_idx on public.product_events (event_type, created_at desc);
create index if not exists product_events_visitor_idx on public.product_events (visitor_id);

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
  coalesce(count(*) filter (where e.event_type = 'open'), 0)::int as opens,
  coalesce(count(*) filter (where e.event_type = 'buy_click'), 0)::int as buy_clicks,
  max(e.created_at) as last_event_at
from public.products p
left join public.product_events e
  on e.product_id = p.id
group by p.id;

grant select on public.product_metrics_report to authenticated;
