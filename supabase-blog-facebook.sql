-- Facebook share tracking for blog posts
-- Run in Supabase SQL Editor. Safe to re-run.

alter table public.blog_posts
  add column if not exists facebook_post_id text not null default '',
  add column if not exists facebook_posted_at timestamptz;

comment on column public.blog_posts.facebook_post_id is
  'Graph API post id returned after publishing to the Facebook Page';
comment on column public.blog_posts.facebook_posted_at is
  'Timestamp of the last successful Facebook Page publish from the admin';
