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
