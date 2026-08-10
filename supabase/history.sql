-- Which bus worked which run, on which day.
--
-- The app can only write down a bus while an operator has that day open and
-- the bus is on the road. Every other day is blank for ever, because there is
-- no historical vehicle feed to go back to: OC Transpo publishes where buses
-- are now and nothing about where they were.
--
-- This is the record that fixes that. A scheduled function watches the feed
-- all day and writes down what it sees, so "which bus did I have on 85-02
-- last Tuesday" has an answer whether or not anybody was looking.
--
-- One row per run, per bus, per day - not one per position report. The
-- question being answered is which bus worked the run, and a bus that worked
-- it all morning is one fact, not four hundred. That is ~700 rows a day
-- rather than a million.
--
-- Run this once in the Supabase SQL editor.

create table if not exists public.bus_history (
  -- The service day, not the calendar day: work that signs off at 2 am
  -- belongs to the day it signed on.
  service_date date not null,
  -- Normalised six-digit paddle, the same spelling the app uses: 085002.
  paddle text not null,
  -- The four-digit number painted on the bus.
  fleet text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  -- How many times this bus has been seen on this run today.
  --
  -- The feed is not always right at a terminus, where the bus finishing the
  -- last trip and the one starting the next are both reporting. Counting
  -- rather than overwriting means one bad minute scores 1 while the bus that
  -- actually worked the run scores hundreds, and the answer is whichever has
  -- the most - the same rule the app already applies to its own sightings.
  sightings integer not null default 1,
  primary key (service_date, paddle, fleet)
);

create index if not exists bus_history_date_paddle
  on public.bus_history (service_date, paddle);
create index if not exists bus_history_date_fleet
  on public.bus_history (service_date, fleet);

alter table public.bus_history enable row level security;

-- Readable by anyone signed in. Which bus worked a run is not personal data -
-- it is the same thing written on the side of the bus, in public, all day -
-- and an operator who picks up someone else's run needs to read its history
-- as much as their own.
drop policy if exists "signed-in operators can read bus history" on public.bus_history;
create policy "signed-in operators can read bus history"
  on public.bus_history for select
  to authenticated
  using (true);

-- Nobody writes to it from the app. The recorder runs as the service role,
-- which bypasses these policies; leaving no insert or update policy means a
-- stolen anon key cannot put a wrong bus number into everyone's history.

-- Recording one sighting.
--
-- A function rather than a bare upsert so the recorder needs no table
-- privileges of its own, and so "seen again" can never be mistaken for "seen
-- for the first time" - last_seen moves, first_seen does not.
create or replace function public.record_bus_sighting(
  p_date date,
  p_paddle text,
  p_fleet text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.bus_history (service_date, paddle, fleet)
  values (p_date, p_paddle, p_fleet)
  on conflict (service_date, paddle, fleet) do update
    set last_seen = now(),
        sightings = public.bus_history.sightings + 1;
$$;

revoke all on function public.record_bus_sighting(date, text, text) from public;
revoke all on function public.record_bus_sighting(date, text, text) from anon;
revoke all on function public.record_bus_sighting(date, text, text) from authenticated;

-- Recording a whole feed sweep in one round trip.
--
-- The recorder sees several hundred buses at once and calling the single-row
-- function that many times over the network would take longer than the gap
-- between sweeps.
create or replace function public.record_bus_sightings(
  p_date date,
  p_rows jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.bus_history (service_date, paddle, fleet)
  select p_date, r->>'paddle', r->>'fleet'
  from jsonb_array_elements(p_rows) as r
  where r->>'paddle' is not null and r->>'fleet' is not null
  on conflict (service_date, paddle, fleet) do update
    set last_seen = now(),
        sightings = public.bus_history.sightings + 1;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.record_bus_sightings(date, jsonb) from public;
revoke all on function public.record_bus_sightings(date, jsonb) from anon;
revoke all on function public.record_bus_sightings(date, jsonb) from authenticated;
