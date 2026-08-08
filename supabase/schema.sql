-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- for project nxjpabakfubquvnyyirs. Safe to run more than once.

-- One row per signed-in operator, holding their whole calendar (entries)
-- and pay rules (settings) as JSON.
create table if not exists app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entries jsonb not null default '{}'::jsonb,
  settings jsonb,
  updated_at timestamptz not null default now()
);

alter table app_data enable row level security;

drop policy if exists "select own app_data" on app_data;
create policy "select own app_data"
  on app_data for select
  using (auth.uid() = user_id);

drop policy if exists "insert own app_data" on app_data;
create policy "insert own app_data"
  on app_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own app_data" on app_data;
create policy "update own app_data"
  on app_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Profile info collected at sign-up (name + operator number), used to let
-- operators log in with their operator number instead of typing their email.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  operator_number text not null unique,
  created_at timestamptz not null default now()
);

-- Sign-up now collects a single "Name" field instead of separate
-- first/last name. Old first_name/last_name columns (if they exist from
-- an earlier version of this schema) are kept but relaxed to nullable so
-- they don't block new signups that only populate full_name.
alter table profiles add column if not exists full_name text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'first_name'
  ) then
    alter table public.profiles alter column first_name drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'last_name'
  ) then
    alter table public.profiles alter column last_name drop not null;
  end if;
end $$;

alter table profiles enable row level security;

drop policy if exists "select own profile" on profiles;
create policy "select own profile"
  on profiles for select
  using (auth.uid() = id);

drop policy if exists "update own profile" on profiles;
create policy "update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Automatically create the profile row from the signup metadata the client
-- passes in (full_name/operator_number) - runs server-side as part of the
-- same transaction as the auth.users insert, so it works whether or not
-- "Confirm email" is required before the client has a session (a
-- client-side insert gated by RLS wouldn't work in that case).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, operator_number)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'operator_number'
  )
  on conflict (id) do nothing;
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

-- One-time backfill: creates missing profile rows for any account that
-- signed up before the trigger above existed (the trigger only fires for
-- NEW signups, it doesn't retroactively fix earlier ones). Safe to re-run -
-- does nothing once every existing auth user already has a profile.
insert into public.profiles (id, full_name, operator_number)
select
  u.id,
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'first_name',
    'Unknown'
  ),
  coalesce(u.raw_user_meta_data->>'operator_number', u.id::text)
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ---------------------------------------------------------------------------
-- Work exchange
--
-- The first part of this app where operators see each other's data. Everything
-- above is scoped to auth.uid() and stops there; a board is by definition
-- shared, so these policies are written to open exactly as much as the feature
-- needs and no more.
--
-- Three rules hold it together:
--   1. Only an approved operator sees anything. Sign-up is open to any email
--      address, so approval - not having an account - is what admits someone.
--   2. Contact details are never on the board. They are released to the two
--      parties of an accepted offer, by a function that checks that, and are
--      not reachable any other way.
--   3. A post can only be changed by the person who wrote it.
-- ---------------------------------------------------------------------------

-- How to reach an operator, and how they prefer to be reached. Deliberately
-- on profiles rather than on each post: it is said once, changed in one place,
-- and never copied into a row that outlives the arrangement it was for.
alter table profiles add column if not exists contact text;
alter table profiles add column if not exists contact_kind text
  check (contact_kind in ('phone', 'text', 'email'));

-- Nobody sees the board until you say so. Default false is the point: a new
-- account can sign in and keep its own calendar, and sees nothing of anyone
-- else's until approved.
alter table profiles add column if not exists approved boolean not null default false;

-- Used by every policy below, so the rule lives in one place. security definer
-- because it reads profiles from inside a policy on another table.
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and approved
  );
$$;

grant execute on function public.is_approved() to authenticated;

-- Who an operator is, for showing a post's author. Name and operator number
-- and nothing else - contact is not selected here, so it cannot leak through
-- this path however the view is queried. The approval check is inside the
-- view because the view reads profiles with the definer's rights.
create or replace view public.operator_directory as
  select p.id, p.full_name, p.operator_number
  from public.profiles p
  where public.is_approved();

grant select on public.operator_directory to authenticated;

create table if not exists exchange_posts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  -- give_away: I want someone to take this. want: I will take work that day.
  -- swap: mine for yours.
  kind text not null check (kind in ('give_away', 'want', 'swap')),
  work_date date not null,
  paddle text,
  on_time text,
  off_time text,
  garage text,
  note text,
  status text not null default 'open'
    check (status in ('open', 'claimed', 'settled', 'withdrawn')),
  -- Kept on the post so the board can say "2 offers" without anyone being
  -- able to read whose offers they are.
  claim_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exchange_posts_date_idx on exchange_posts (work_date);
create index if not exists exchange_posts_owner_idx on exchange_posts (owner);

alter table exchange_posts enable row level security;

drop policy if exists "approved operators read posts" on exchange_posts;
create policy "approved operators read posts"
  on exchange_posts for select
  using (public.is_approved());

drop policy if exists "own posts insert" on exchange_posts;
create policy "own posts insert"
  on exchange_posts for insert
  with check (public.is_approved() and auth.uid() = owner);

drop policy if exists "own posts update" on exchange_posts;
create policy "own posts update"
  on exchange_posts for update
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

drop policy if exists "own posts delete" on exchange_posts;
create policy "own posts delete"
  on exchange_posts for delete
  using (auth.uid() = owner);

create table if not exists exchange_claims (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references exchange_posts(id) on delete cascade,
  claimant uuid not null references auth.users(id) on delete cascade,
  note text,
  status text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  -- One offer per person per post. Putting your hand up twice is the same
  -- hand.
  unique (post_id, claimant)
);

create index if not exists exchange_claims_post_idx on exchange_claims (post_id);
create index if not exists exchange_claims_claimant_idx on exchange_claims (claimant);

alter table exchange_claims enable row level security;

-- An offer is between two people. Everyone else sees only the count, from
-- the post.
drop policy if exists "parties read claims" on exchange_claims;
create policy "parties read claims"
  on exchange_claims for select
  using (
    auth.uid() = claimant
    or auth.uid() = (select owner from exchange_posts p where p.id = post_id)
  );

drop policy if exists "offer on someone else's post" on exchange_claims;
create policy "offer on someone else's post"
  on exchange_claims for insert
  with check (
    public.is_approved()
    and auth.uid() = claimant
    and exists (
      select 1 from exchange_posts p
      where p.id = post_id and p.status = 'open' and p.owner <> auth.uid()
    )
  );

-- The poster accepts or declines; the claimant can withdraw. Both are an
-- update to the same row, so both are allowed and the app decides which
-- fields it touches.
drop policy if exists "parties update claims" on exchange_claims;
create policy "parties update claims"
  on exchange_claims for update
  using (
    auth.uid() = claimant
    or auth.uid() = (select owner from exchange_posts p where p.id = post_id)
  )
  with check (
    auth.uid() = claimant
    or auth.uid() = (select owner from exchange_posts p where p.id = post_id)
  );

-- Keeps claim_count honest without exposing the claims themselves.
create or replace function public.sync_claim_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.post_id, old.post_id);
begin
  update public.exchange_posts p
  set claim_count = (
    select count(*) from public.exchange_claims c
    where c.post_id = target and c.status = 'offered'
  )
  where p.id = target;
  return null;
end;
$$;

drop trigger if exists exchange_claims_count on exchange_claims;
create trigger exchange_claims_count
  after insert or update or delete on exchange_claims
  for each row execute function public.sync_claim_count();

-- The only way to reach anyone's contact details.
--
-- Returns the other party of an accepted offer, to the two people it is
-- between, and nothing to anyone else. Not a view and not a policy on
-- profiles, because both of those are column-blind: this hands back one
-- person's details for one arrangement, and only while it stands.
create or replace function public.exchange_contact(claim uuid)
returns table (full_name text, operator_number text, contact text, contact_kind text)
language sql
stable
security definer
set search_path = public
as $$
  select p.full_name, p.operator_number, p.contact, p.contact_kind
  from public.exchange_claims c
  join public.exchange_posts po on po.id = c.post_id
  join public.profiles p
    -- Whichever of the two you are not.
    on p.id = case when auth.uid() = c.claimant then po.owner else c.claimant end
  where c.id = claim
    and c.status = 'accepted'
    and auth.uid() in (c.claimant, po.owner);
$$;

grant execute on function public.exchange_contact(uuid) to authenticated;
