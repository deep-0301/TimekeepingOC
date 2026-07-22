-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- for project nxjpabakfubquvnyyirs.

-- One row per signed-in operator, holding their whole calendar (entries)
-- and pay rules (settings) as JSON.
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

-- Profile info collected at sign-up (name + operator number), used to let
-- operators log in with their operator number instead of typing their email.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  operator_number text not null unique,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "select own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Automatically create the profile row from the signup metadata the client
-- passes in (first_name/last_name/operator_number) - runs server-side as
-- part of the same transaction as the auth.users insert, so it works
-- whether or not "Confirm email" is required before the client has a
-- session (a client-side insert gated by RLS wouldn't work in that case).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, operator_number)
  values (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'operator_number'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Narrow, purpose-built lookup for the login screen: resolves an operator
-- number to its email so the client can call signInWithPassword (which
-- requires an email/phone, not an arbitrary username). security definer so
-- it can read across profiles/auth.users despite RLS, but it only ever
-- returns a single email string - nothing else about the account is exposed.
create or replace function public.get_email_for_operator(op_number text)
returns text
language sql
security definer
set search_path = public
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.operator_number = op_number
  limit 1;
$$;

grant execute on function public.get_email_for_operator(text) to anon, authenticated;
