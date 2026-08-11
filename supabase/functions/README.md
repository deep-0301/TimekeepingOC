# Edge functions

## `bus` — live OC Transpo vehicle positions

The site is a static export served from GitHub Pages, so it has no server of
its own. This function is the one piece that has to run somewhere: it holds
the OC Transpo subscription key, calls the GTFS-Realtime feeds, and answers
the browser with plain JSON and open CORS headers.

Without it the browser cannot do the job itself, for three separate reasons:

1. The subscription key would be sitting in the JavaScript bundle, readable by
   anyone who opens dev tools, and usable until it is rotated.
2. The Azure gateway sends no `Access-Control-Allow-Origin` header, so the
   browser discards the response even though the server answered.
3. The two feeds are separate calls that have to be joined on trip id before
   the page can show whether a bus is running late.

### Feeds it reads

| Feed | URL |
| --- | --- |
| Vehicle positions | `https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-vp/beta/v1/VehiclePositions` |
| Trip updates | `https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates` |

Both are covered by a single subscription on the
[OC Transpo developer portal](https://nextrip-public-api.developer.azure-api.net/),
under the product that lists *GTFS-RT Trip Updates* and *GTFS-RT Vehicle
Positions*. The key goes in the `Ocp-Apim-Subscription-Key` header, and
`format=json` is appended so nothing here has to decode protobuf.

Both URLs are defaults, overridable with the `OCT_VP_URL` and `OCT_TU_URL`
secrets. They are worth overriding rather than editing: the paths still say
`beta/v1`, and beta endpoints move.

### Deploying

```bash
supabase link --project-ref nxjpabakfubquvnyyirs
supabase secrets set OCT_API_KEY=<your primary key>
supabase functions deploy bus
```

`OCT_API_KEY` is the primary key from the portal's Profile page. It belongs
only in Supabase secrets — never in this repository, and never in the client
bundle.

### Checking it works

```bash
curl "https://nxjpabakfubquvnyyirs.supabase.co/functions/v1/bus?q=4358" \
  -H "Authorization: Bearer <anon key>"
```

The anon key is the public one already in `src/lib/supabaseClient.ts`. Edge
functions verify a JWT by default and the app is behind a login, so the
browser sends the signed-in user's token automatically.

A successful response looks like:

```json
{
  "query": "4358",
  "kind": "bus",
  "feedTs": 1785000000,
  "total": 612,
  "vehicles": [
    { "fleet": "4358", "route": "36", "lat": 45.42, "lon": -75.69, "delay": 120 }
  ]
}
```

`total` counts every bus in the feed, matched or not, so a response with an
empty `vehicles` array and a healthy `total` means the feed is fine and that
particular bus simply is not on the road.

### Caching

Vehicle positions are held for 12 seconds and trip updates for 30, in memory,
keyed by URL. Requests arriving while a fetch is already running wait on that
same fetch rather than starting another. A depot's worth of operators
refreshing at once therefore costs OC Transpo one call per window, not fifty.

Note that Supabase may run several instances of the function, each with its
own cache, so the effective upstream rate is per instance.

### On field names

GTFS-Realtime is specified in protobuf, and JSON renderings of it disagree
about casing — `routeId` from some gateways, `route_id` from others. Every
read goes through a `pick()` helper that tries both, because the live feed was
not reachable from the machine this was written on and guessing one spelling
would have been a coin flip.

The same caution applies to the fleet number. Some agencies put it in
`vehicle.vehicle.id`, others use an internal key there and put the painted
number in `label`. Both are checked, preferring a bare three-to-five digit
value.

## `record-buses` — which bus worked which run, kept for good

The `bus` function above answers *now*. It cannot answer *last Tuesday*,
because OC Transpo publishes where vehicles are and nothing about where they
were: a run nobody was watching is blank for ever.

This function is the watcher. On a schedule it reads the vehicle feed once,
turns each reported trip into the paddle that works it using the mapping the
site already ships, and writes one row per run per bus per day.

One row per run per bus — not one per position report. The question being
answered is which bus worked the run, and a bus that worked it all morning is
one fact, not four hundred. That is roughly 700 rows a day rather than a
million, which is the difference between comfortably inside the free tier and
outgrowing it in a week.

Each sweep bumps a count rather than overwriting. At a terminus the feed
briefly shows the bus finishing the last trip and the bus starting the next on
the same trip id; over a day that mistake scores one or two while the bus that
actually worked the run scores hundreds, so the answer is simply whichever was
seen most. Same rule the app already applies to its own sightings.

### Setting it up

1. Create the table and the write functions — run `supabase/history.sql` in the
   Supabase SQL editor. It is safe to run twice.

2. Deploy the function. It reuses `OCT_API_KEY`, so if `bus` is already
   deployed there is no new secret:

   ```bash
   supabase functions deploy record-buses
   ```

3. Schedule it. In the SQL editor, with `pg_cron` and `pg_net` enabled
   (Database → Extensions):

   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;

   select cron.schedule(
     'record-buses',
     '* * * * *',
     $$
     select net.http_post(
       url := 'https://nxjpabakfubquvnyyirs.supabase.co/functions/v1/record-buses',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer <service-role-key>'
       ),
       timeout_milliseconds := 30000
     );
     $$
   );
   ```

   `timeout_milliseconds` is load-bearing. pg_net defaults to one second, and
   this function calls OC Transpo and waits for an answer, which takes longer
   than that on a bad minute. Left at the default the job looks scheduled,
   runs, and quietly records nothing.

   Every minute is plenty — a bus stays on a run for hours, and the count only
   has to be large enough to drown out a bad minute. Stop it again with
   `select cron.unschedule('record-buses');`.

### Checking it is running

```sql
-- Is the job there, and when did it last fire?
select jobid, schedule, active from cron.job where jobname = 'record-buses';
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'record-buses')
order by start_time desc limit 5;

-- The only proof that matters: rows arriving, and counts climbing.
select service_date,
       count(*) as rows,
       count(distinct paddle) as runs,
       max(sightings) as most_seen
from bus_history
group by service_date
order by service_date desc;
```

`most_seen` climbing by roughly one a minute is the job working. Rows but no
climb means it is inserting and never updating, which would mean the paddle
numbers are not matching between sweeps.

### Checking it works

```bash
curl -X POST "$SUPABASE_URL/functions/v1/record-buses" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

It answers with what it did:

```json
{ "date": "2026-08-10", "vehicles": 612, "unmapped": 44, "recorded": 568 }
```

`unmapped` is the count of reported trips the paddle mapping could not name a
run for. A small number is normal — charters, and trips added since the
mapping was built. A number close to `vehicles` means the mapping has expired
and the new booking's needs building with `scripts/build-paddle-trips.py`.

### What it does not do

It does not store positions, delays, or cancellations, so it cannot answer
where a bus was at 3 pm or how late it ran. That is what
[Better Transit Ottawa's tracker](https://github.com/Better-Transit-Ottawa/bus-tracker)
is for, and it keeps a row per vehicle per sweep to do it. This keeps the one
fact an operator needs off it — which bus was on my run — for a thousandth of
the storage.
