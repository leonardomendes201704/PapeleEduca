-- Push devices for blog moderation app (Capacitor / FCM)
-- Run in Supabase SQL Editor. Safe to re-run.

create table if not exists public.admin_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fcm_token text not null,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fcm_token)
);

create index if not exists admin_push_devices_user_idx
  on public.admin_push_devices (user_id);

alter table public.admin_push_devices enable row level security;

drop policy if exists "Admins manage own push devices" on public.admin_push_devices;
create policy "Admins manage own push devices"
on public.admin_push_devices for all
using (auth.uid() = user_id and public.is_admin(auth.uid()))
with check (auth.uid() = user_id and public.is_admin(auth.uid()));

grant select, insert, update, delete on public.admin_push_devices to authenticated;

-- Service role (webhook / notify API) reads all tokens via service key (bypasses RLS).

comment on table public.admin_push_devices is
  'FCM tokens for admin moderation app; notify via /api/blog/notify-draft webhook.';
