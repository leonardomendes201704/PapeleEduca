-- Blog settings on site_settings (singleton id = 1)
-- Run in Supabase SQL Editor if the column does not exist yet.

alter table public.site_settings
  add column if not exists blog_menu_enabled boolean not null default true;

comment on column public.site_settings.blog_menu_enabled is
  'When true, the Blog item is shown in the public site topbar.';
