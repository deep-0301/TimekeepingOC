-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- for project nxjpabakfubquvnyyirs. One row per signed-in operator, holding
-- their whole calendar (entries) and pay rules (settings) as JSON.

create table if not exists app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entries jsonb not null default '{}'::jsonb,
  settings jsonb,
  updated_at timestamptz not null default now()
);

alter table app_data enable row level security;

create policy "select own app_data"
  on app_data for select
  using (auth.uid() = user_id);

create policy "insert own app_data"
  on app_data for insert
  with check (auth.uid() = user_id);

create policy "update own app_data"
  on app_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
