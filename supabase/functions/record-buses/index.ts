/**
 * Writing down which bus is on which run, all day, whether anyone is looking.
 *
 * The app can only record a bus while an operator has that day open and the
 * bus is on the road. Every other day stays blank for ever: OC Transpo
 * publishes where buses are now and nothing about where they were, so a run
 * nobody watched cannot be recovered afterwards at all.
 *
 * This closes that. It is called on a schedule, reads the vehicle feed once,
 * turns each reported trip into the paddle that works it, and writes one row
 * per run per bus per day. Sweep after sweep the same row is bumped rather
 * than duplicated, so a full day of a bus on a run costs one row and carries
 * a count of how often it was seen there.
 *
 * The count is what makes it trustworthy. At a terminus the feed briefly has
 * the bus finishing the last trip and the bus starting the next one both on
 * the same trip id; over a day that mistake scores one or two while the bus
 * that actually worked the run scores hundreds, so the answer is simply
 * whichever was seen most.
 *
 * Deploy:
 *   supabase secrets set OCT_API_KEY=...
 *   supabase functions deploy record-buses
 *
 * Schedule it (Supabase SQL editor, needs pg_cron and pg_net):
 *   select cron.schedule(
 *     'record-buses',
 *     '* * * * *',
 *     $$ select net.http_post(
 *          url := 'https://<project>.supabase.co/functions/v1/record-buses',
 *          headers := '{"Authorization":"Bearer <service-role-key>"}'::jsonb
 *        ) $$
 *   );
 */

const VP_URL =
  Deno.env.get("OCT_VP_URL") ??
  "https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-vp/beta/v1/VehiclePositions";

/**
 * Where the paddle mapping lives.
 *
 * Fetched from the published site rather than copied in here, so there is one
 * mapping and not two that drift. It is rebuilt whenever the booking changes,
 * and this picks that up on its next cold start.
 */
const TRIPS_URL =
  Deno.env.get("PADDLE_TRIPS_URL") ??
  "https://deep-0301.github.io/TimekeepingOC/paddle-trips.json";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

// deno-lint-ignore no-explicit-any
type Json = any;

// ---------------------------------------------------------------------------
// Reading the feed
//
// Every JSON serialisation of GTFS-Realtime picks its own casing - `routeId`,
// `route_id`, `RouteId`. Names are compared with case and separators stripped
// so the reader does not have to be pinned to whichever OC Transpo emits
// today. (The same approach as the `bus` function; kept self-contained here
// so that one keeps working untouched whatever happens to this.)
// ---------------------------------------------------------------------------

function pick(obj: Json, ...names: string[]): Json {
  if (!obj || typeof obj !== "object") return undefined;
  const want = names.map((n) => n.replace(/[^a-z0-9]/gi, "").toLowerCase());
  for (const key of Object.keys(obj)) {
    const k = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (want.includes(k)) return obj[key];
  }
  return undefined;
}

function str(v: Json): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

/** The number painted on the bus, out of whatever the feed calls it. */
function fleetNumber(id?: string, label?: string): string | undefined {
  for (const v of [label, id]) {
    const m = v?.match(/\d{4,5}/);
    if (m) return m[0];
  }
  return undefined;
}

/** The number on the front of the bus, out of a GTFS route id like "88-371-1". */
function routeNumber(routeId?: string): string | undefined {
  return routeId?.trim().split("-")[0].replace(/[^A-Za-z0-9]/g, "") || undefined;
}

/**
 * A revenue route.
 *
 * 800 and up is school and charter work, which is never a booked paddle's.
 * Recording one against a run would be a wrong answer rather than a missing
 * one, so it is dropped before anything is written.
 */
function isRevenueRoute(route?: string): boolean {
  const n = parseInt((route ?? "").trim(), 10);
  return !Number.isFinite(n) || n < 800;
}

function entitiesOf(feed: Json): Json[] {
  if (Array.isArray(feed)) return feed;
  const entity = pick(feed, "entity", "entities");
  return Array.isArray(entity) ? entity : [];
}

interface Seen {
  fleet: string;
  tripId: string;
  route?: string;
}

function readVehicles(feed: Json): Seen[] {
  const out: Seen[] = [];
  for (const e of entitiesOf(feed)) {
    const v = pick(e, "vehicle") ?? e;
    if (!v || typeof v !== "object") continue;
    const desc = pick(v, "vehicle") ?? {};
    const trip = pick(v, "trip") ?? {};
    const fleet = fleetNumber(str(pick(desc, "id")), str(pick(desc, "label")));
    const tripId = str(pick(trip, "tripId"));
    if (!fleet || !tripId) continue;
    out.push({ fleet, tripId, route: routeNumber(str(pick(trip, "routeId"))) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The service day
//
// Work that signs off at two in the morning belongs to the day it signed on,
// which is also how the paddle book and the booking sheet read. Ottawa's
// clock decides it, not the server's.
// ---------------------------------------------------------------------------

function serviceDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = parseInt(get("hour"), 10);
  const d = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00Z`);
  // Before 3 am the service day is still yesterday's.
  if (hour < 3) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// The mapping, held between invocations
// ---------------------------------------------------------------------------

let trips: Record<string, string> | null = null;
let tripsAt = 0;
const TRIPS_TTL_MS = 6 * 60 * 60 * 1000;

async function paddleTrips(): Promise<Record<string, string>> {
  if (trips && Date.now() - tripsAt < TRIPS_TTL_MS) return trips;
  const res = await fetch(TRIPS_URL);
  if (!res.ok) throw new Error(`paddle mapping ${res.status}`);
  const body = await res.json();
  trips = (body?.trips ?? {}) as Record<string, string>;
  tripsAt = Date.now();
  return trips;
}

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  /**
   * Who is allowed to set this off.
   *
   * Nothing but a schedule should be calling this, and the platform's own JWT
   * check is an awkward way to say so: it wants a key in a particular format,
   * which changes as Supabase changes its key formats, and it means the key
   * that bypasses every access rule in the database has to be written into a
   * cron job to make a bus recorder work. Neither is worth it for a job whose
   * whole risk is spending someone else's API quota.
   *
   * So: set RECORDER_SECRET to any random string, have the schedule send it,
   * and turn the platform's JWT check off. The secret is worth nothing beyond
   * triggering this one function.
   *
   * Unset, nothing changes - the platform's check is doing the work, which is
   * the arrangement that was here before.
   */
  const secret = Deno.env.get("RECORDER_SECRET");
  if (secret && req.headers.get("x-recorder-secret") !== secret) {
    return json({ error: "not allowed" }, 401);
  }

  const apiKey = Deno.env.get("OCT_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey) return json({ error: "OCT_API_KEY is not set" }, 500);
  if (!url || !serviceKey) return json({ error: "Supabase env is not set" }, 500);

  try {
    const [map, res] = await Promise.all([
      paddleTrips(),
      fetch(VP_URL, { headers: { "Ocp-Apim-Subscription-Key": apiKey } }),
    ]);
    if (!res.ok) return json({ error: `vehicle feed ${res.status}` }, 502);

    const seen = readVehicles(await res.json());

    // One row per run per bus. A bus reported twice in one sweep - two trips
    // of the same run either side of a timepoint - is still one sighting, or
    // a paddle would score twice for standing still.
    const rows = new Map<string, { paddle: string; fleet: string }>();
    let unmapped = 0;
    for (const v of seen) {
      if (!isRevenueRoute(v.route)) continue;
      const paddle = map[v.tripId];
      if (!paddle) {
        unmapped++;
        continue;
      }
      rows.set(`${paddle}|${v.fleet}`, { paddle, fleet: v.fleet });
    }

    const date = serviceDate();
    const payload = [...rows.values()];
    if (payload.length === 0) {
      return json({ date, vehicles: seen.length, unmapped, recorded: 0 });
    }

    const wrote = await fetch(`${url}/rest/v1/rpc/record_bus_sightings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ p_date: date, p_rows: payload }),
    });
    if (!wrote.ok) {
      return json({ error: `write failed ${wrote.status}: ${await wrote.text()}` }, 502);
    }

    return json({
      date,
      vehicles: seen.length,
      // How many reported trips the mapping could not name a paddle for. Worth
      // watching: a number close to the total means the mapping has expired
      // and a new booking's needs building.
      unmapped,
      recorded: payload.length,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
