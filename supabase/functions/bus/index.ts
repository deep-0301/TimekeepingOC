/**
 * Live bus lookup, proxied.
 *
 * The site is a static export on GitHub Pages, so it has no server of its own
 * and cannot call OC Transpo directly: the subscription key would be sitting
 * in the JavaScript bundle for anyone to lift, and the Azure gateway sends no
 * CORS headers, so the browser would throw the response away regardless.
 *
 * This function is that missing server. It holds the key, calls the two
 * GTFS-Realtime feeds, flattens them into something the page can render, and
 * answers with CORS open. It also caches for a few seconds, so a busload of
 * operators refreshing at once costs OC Transpo one request rather than fifty.
 *
 * Deploy:
 *   supabase secrets set OCT_API_KEY=...
 *   supabase functions deploy bus
 *
 * Try it:
 *   curl "$SUPABASE_URL/functions/v1/bus?q=4358" -H "Authorization: Bearer $ANON_KEY"
 */

const VP_URL =
  Deno.env.get("OCT_VP_URL") ??
  "https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-vp/beta/v1/VehiclePositions";
const TU_URL =
  Deno.env.get("OCT_TU_URL") ??
  "https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates";

/** Vehicle positions move constantly; trip updates are worth holding longer. */
const VP_TTL_MS = 12_000;
const TU_TTL_MS = 30_000;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Reading GTFS-Realtime JSON
//
// The spec is defined in protobuf, and every JSON serialisation of it picks
// its own casing - `routeId` from one gateway, `route_id` from another,
// `RouteId` from anything built on .NET. Rather than pin this to whatever OC
// Transpo emits today, every read goes through `pick`, which compares names
// with case and separators stripped: `routeId`, `route_id`, `RouteId` and
// `ROUTE_ID` are all the same key as far as this function is concerned.
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Json = any;

function normalise(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Normalised key -> real key, built once per object.
 *
 * A feed carries thousands of entities and each is read a dozen times over,
 * so the mapping is cached against the object itself rather than rebuilt on
 * every lookup.
 */
const keyMaps = new WeakMap<object, Map<string, string>>();

function keyMap(obj: object): Map<string, string> {
  let map = keyMaps.get(obj);
  if (!map) {
    map = new Map();
    for (const key of Object.keys(obj)) {
      const n = normalise(key);
      // First spelling wins, so an exact match is never shadowed by a later
      // key that happens to normalise the same way.
      if (!map.has(n)) map.set(n, key);
    }
    keyMaps.set(obj, map);
  }
  return map;
}

function pick(obj: Json, ...names: string[]): Json {
  if (!obj || typeof obj !== "object") return undefined;
  for (const name of names) {
    // Fast path: the feed already spells it the way we asked.
    if (obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  const map = keyMap(obj);
  for (const name of names) {
    const real = map.get(normalise(name));
    if (real !== undefined && obj[real] !== undefined && obj[real] !== null) {
      return obj[real];
    }
  }
  return undefined;
}

function num(v: Json): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: Json): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

/**
 * The number painted on the side of the bus.
 *
 * Agencies are inconsistent about where this lands - sometimes `vehicle.id`
 * is the fleet number, sometimes it is an internal key like "1-4358" and the
 * fleet number is only in `label`. Both are checked, and a bare run of three
 * to five digits is taken as the answer.
 */
function fleetNumber(id?: string, label?: string): string | undefined {
  for (const candidate of [label, id]) {
    if (!candidate) continue;
    if (/^\d{3,5}$/.test(candidate)) return candidate;
  }
  for (const candidate of [label, id]) {
    if (!candidate) continue;
    const m = candidate.match(/(\d{3,5})(?!.*\d)/);
    if (m) return m[1];
  }
  return undefined;
}

interface Vehicle {
  fleet?: string;
  vehicleId?: string;
  label?: string;
  route?: string;
  tripId?: string;
  directionId?: number;
  startTime?: string;
  lat?: number;
  lon?: number;
  bearing?: number;
  speed?: number;
  stopId?: string;
  stopSequence?: number;
  status?: string;
  occupancy?: string;
  ts?: number;
  /** Seconds behind schedule; negative is running early. From TripUpdates. */
  delay?: number;
}

/**
 * The entity list, wherever this gateway decided to put it.
 *
 * GTFS-Realtime says `entity` at the top level. Gateways that re-wrap the
 * feed tend to hang it off `data` or hand back the bare array, so all three
 * are accepted before giving up.
 */
function entitiesOf(feed: Json): Json[] {
  if (Array.isArray(feed)) return feed;
  const direct = pick(feed, "entity", "entities");
  if (Array.isArray(direct)) return direct;
  for (const wrapper of ["data", "feed", "result", "response"]) {
    const inner = pick(feed, wrapper);
    if (!inner) continue;
    if (Array.isArray(inner)) return inner;
    const nested = pick(inner, "entity", "entities");
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

function readVehicles(feed: Json): Vehicle[] {
  const entities = entitiesOf(feed);

  const out: Vehicle[] = [];
  for (const entity of entities) {
    const v = pick(entity, "vehicle");
    if (!v) continue;

    // `vehicle.vehicle` is the VehicleDescriptor - the bus itself - as
    // opposed to the outer `vehicle`, which is the position report.
    const descriptor = pick(v, "vehicle") ?? {};
    const trip = pick(v, "trip") ?? {};
    const position = pick(v, "position") ?? {};

    const vehicleId = str(pick(descriptor, "id"));
    const label = str(pick(descriptor, "label"));

    out.push({
      fleet: fleetNumber(vehicleId, label),
      vehicleId,
      label,
      route: str(pick(trip, "routeId")),
      tripId: str(pick(trip, "tripId")),
      directionId: num(pick(trip, "directionId")),
      startTime: str(pick(trip, "startTime")),
      lat: num(pick(position, "latitude", "lat")),
      lon: num(pick(position, "longitude", "lon")),
      bearing: num(pick(position, "bearing")),
      speed: num(pick(position, "speed")),
      stopId: str(pick(v, "stopId")),
      stopSequence: num(pick(v, "currentStopSequence")),
      status: str(pick(v, "currentStatus")),
      occupancy: str(pick(v, "occupancyStatus")),
      ts: num(pick(v, "timestamp")),
    });
  }
  return out;
}

/** tripId -> seconds late, taken from the trip's next stop update. */
function readDelays(feed: Json): Map<string, number> {
  const delays = new Map<string, number>();
  for (const entity of entitiesOf(feed)) {
    const tu = pick(entity, "tripUpdate");
    if (!tu) continue;
    const tripId = str(pick(pick(tu, "trip") ?? {}, "tripId"));
    if (!tripId) continue;

    let delay = num(pick(tu, "delay"));
    if (delay === undefined) {
      const updates = pick(tu, "stopTimeUpdate") ?? [];
      if (Array.isArray(updates)) {
        for (const u of updates) {
          const d =
            num(pick(pick(u, "departure") ?? {}, "delay")) ??
            num(pick(pick(u, "arrival") ?? {}, "delay"));
          if (d !== undefined) {
            delay = d;
            break;
          }
        }
      }
    }
    if (delay !== undefined) delays.set(tripId, delay);
  }
  return delays;
}

// ---------------------------------------------------------------------------
// Upstream fetch, cached
// ---------------------------------------------------------------------------

interface Cached {
  at: number;
  body: Json;
}

const cache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<Json>>();

async function feed(url: string, ttl: number, apiKey: string): Promise<Json> {
  const hit = cache.get(url);
  const now = Date.now();
  if (hit && now - hit.at < ttl) return hit.body;

  // Two requests arriving inside the same TTL window share one upstream call.
  const pending = inFlight.get(url);
  if (pending) return pending;

  const target = new URL(url);
  target.searchParams.set("format", "json");

  const task = fetch(target, {
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      accept: "application/json",
    },
  })
    .then(async (res) => {
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 400);
        throw new Error(
          `OC Transpo returned ${res.status} for ${target.pathname}${
            detail ? `: ${detail}` : ""
          }`,
        );
      }
      const body = await res.json();
      cache.set(url, { at: Date.now(), body });
      return body;
    })
    .finally(() => inFlight.delete(url));

  inFlight.set(url, task);
  return task;
}

// ---------------------------------------------------------------------------
// Coordinates to a street name
//
// The feed gives a latitude and a longitude, which is not an answer to "where
// is my bus". OpenStreetMap's reverse geocoder turns the pair into a road and
// a neighbourhood.
//
// It runs here rather than in the page for three reasons: their usage policy
// asks for one identified client rather than a browser per operator, it caps
// callers at a request a second, and a cache kept here serves everyone at
// once. All three are handled below.
// ---------------------------------------------------------------------------

const GEO_URL =
  Deno.env.get("OCT_GEOCODER_URL") ??
  "https://nominatim.openstreetmap.org/reverse";

/** Their policy asks callers to identify themselves. */
const GEO_AGENT =
  "TimekeepingOC/1.0 (+https://deep-0301.github.io/TimekeepingOC/)";

/** Roads do not move, so a hit stays good for a day. */
const GEO_TTL_MS = 24 * 60 * 60 * 1000;
const GEO_MAX_ENTRIES = 5000;
const GEO_MIN_GAP_MS = 1100;

interface Place {
  label: string;
  road?: string;
  area?: string;
  attribution: string;
}

const geoCache = new Map<string, { at: number; place: Place }>();

/** ~11 m, so buses sitting at the same stop share one lookup. */
function geoKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

// One upstream call at a time, spaced out. Every request joins the tail of
// this chain, so the rate limit holds however many arrive at once.
let geoChain: Promise<unknown> = Promise.resolve();
let geoLast = 0;

function geoQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = geoChain.then(async () => {
    const wait = GEO_MIN_GAP_MS - (Date.now() - geoLast);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    geoLast = Date.now();
    return task();
  });
  // The chain must survive a failed lookup, or one error stops every later
  // request behind it.
  geoChain = run.catch(() => {});
  return run;
}

function readPlace(body: Json): Place | null {
  const address = pick(body, "address") ?? {};
  const road =
    str(pick(address, "road")) ??
    str(pick(address, "pedestrian")) ??
    str(pick(address, "footway")) ??
    str(pick(body, "name"));
  const area =
    str(pick(address, "neighbourhood")) ??
    str(pick(address, "suburb")) ??
    str(pick(address, "cityDistrict")) ??
    str(pick(address, "town")) ??
    str(pick(address, "village")) ??
    str(pick(address, "city"));

  const label = road && area ? `${road}, ${area}` : (road ?? area);
  if (!label) return null;

  return {
    label,
    road,
    area,
    attribution: str(pick(body, "licence")) ?? "© OpenStreetMap contributors",
  };
}

async function place(lat: number, lon: number): Promise<Place | null> {
  const key = geoKey(lat, lon);
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < GEO_TTL_MS) return hit.place;

  const target = new URL(GEO_URL);
  target.searchParams.set("format", "jsonv2");
  target.searchParams.set("lat", String(lat));
  target.searchParams.set("lon", String(lon));
  // Street level. Zooming out lands on the suburb, which is not an answer.
  target.searchParams.set("zoom", "17");
  target.searchParams.set("addressdetails", "1");

  const found = await geoQueue(async () => {
    const res = await fetch(target, {
      headers: { "user-agent": GEO_AGENT, "accept-language": "en" },
    });
    if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
    return readPlace(await res.json());
  });

  if (found) {
    // Oldest out first, so a long-running instance cannot grow without bound.
    if (geoCache.size >= GEO_MAX_ENTRIES) {
      const oldest = geoCache.keys().next().value;
      if (oldest !== undefined) geoCache.delete(oldest);
    }
    geoCache.set(key, { at: Date.now(), place: found });
  }
  return found;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Four digits is a bus, anything else is a route. OC Transpo fleet numbers
 * are four digits and route numbers are one to three (plus lettered ones like
 * R1 and E1), so the query alone says which the operator meant.
 */
function looksLikeFleetNumber(q: string): boolean {
  return /^\d{4,5}$/.test(q);
}

function matches(v: Vehicle, q: string): boolean {
  const lower = q.toLowerCase();
  if (looksLikeFleetNumber(q)) {
    return (
      v.fleet === q ||
      v.vehicleId?.toLowerCase() === lower ||
      v.label?.toLowerCase() === lower ||
      v.vehicleId?.includes(q) === true ||
      v.label?.includes(q) === true
    );
  }
  return v.route?.toLowerCase() === lower;
}

// ---------------------------------------------------------------------------

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const params = new URL(req.url).searchParams;
  let debug = params.get("debug") === "1";
  let lat = num(params.get("lat"));
  let lon = num(params.get("lon"));

  let q = "";
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    q = String(pick(body, "q", "bus", "query") ?? "").trim();
    // The page invokes this over POST, where there is no query string, so
    // everything has to be readable from the body as well.
    const flag = pick(body, "debug");
    if (flag === true || flag === 1 || flag === "1") debug = true;
    lat = lat ?? num(pick(body, "lat"));
    lon = lon ?? num(pick(body, "lon"));
  } else {
    q = (params.get("q") ?? params.get("bus") ?? "").trim();
  }

  // A coordinate lookup answers on its own - it touches neither feed, so it
  // is settled before the OC Transpo key is required.
  if (lat !== undefined && lon !== undefined) {
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return json({ error: "That is not a coordinate on Earth." }, 400);
    }
    try {
      const found = await place(lat, lon);
      return found
        ? json(found)
        : json({ error: "No road is recorded at that point." }, 404);
    } catch (err) {
      return json(
        { error: err instanceof Error ? err.message : String(err) },
        502,
      );
    }
  }

  const apiKey = Deno.env.get("OCT_API_KEY");
  if (!apiKey) {
    return json(
      {
        error:
          "This deployment has no OC Transpo key. Set it with: supabase secrets set OCT_API_KEY=...",
      },
      500,
    );
  }

  try {
    const vp = await feed(VP_URL, VP_TTL_MS, apiKey);

    // `?debug=1` answers with the feed's shape rather than its contents, for
    // when the parser reads zero vehicles and the question is what the
    // gateway actually sent. It carries no key and no secret - the sample is
    // one bus's public position report.
    if (debug) {
      const entities = entitiesOf(vp);
      return json({
        topLevelType: Array.isArray(vp) ? "array" : typeof vp,
        topLevelKeys:
          vp && typeof vp === "object" && !Array.isArray(vp)
            ? Object.keys(vp)
            : null,
        entityCount: entities.length,
        firstEntity: entities[0] ?? null,
        parsedFirstVehicle: readVehicles(vp)[0] ?? null,
      });
    }

    const all = readVehicles(vp);

    // Only the matched vehicles get the trip-update join. Pulling the second
    // feed for a bare count would be a wasted call.
    const found = q ? all.filter((v) => matches(v, q)) : [];

    if (found.length > 0) {
      try {
        const tu = await feed(TU_URL, TU_TTL_MS, apiKey);
        const delays = readDelays(tu);
        for (const v of found) {
          if (v.tripId && delays.has(v.tripId)) v.delay = delays.get(v.tripId);
        }
      } catch {
        // Schedule adherence is a bonus. If that feed is down, the position
        // is still worth showing.
      }
    }

    found.sort((a, b) => (a.fleet ?? "").localeCompare(b.fleet ?? ""));

    return json({
      query: q,
      kind: q ? (looksLikeFleetNumber(q) ? "bus" : "route") : "none",
      feedTs: num(pick(pick(vp, "header") ?? {}, "timestamp")) ?? null,
      fetchedAt: Date.now(),
      total: all.length,
      routes: q ? undefined : [...new Set(all.map((v) => v.route).filter(Boolean))].sort(),
      vehicles: found,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
