/**
 * Live vehicle positions, by way of the `bus` Supabase edge function.
 *
 * Nothing here talks to OC Transpo directly - see supabase/functions/bus for
 * why that has to go through a server.
 */

import { supabase } from "./supabaseClient";

export interface BusVehicle {
  /** The four-digit number painted on the bus. */
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
  /** Metres per second, as GTFS-Realtime reports it. */
  speed?: number;
  stopId?: string;
  stopSequence?: number;
  status?: string;
  occupancy?: string;
  /** Unix seconds when the bus last reported. */
  ts?: number;
  /** Seconds behind schedule; negative means running early. */
  delay?: number;
}

export interface BusFeed {
  query: string;
  kind: "bus" | "route" | "none";
  feedTs: number | null;
  fetchedAt: number;
  /** Vehicles in service across the whole system, matched or not. */
  total: number;
  routes?: string[];
  vehicles: BusVehicle[];
}

const UNREACHABLE =
  "Could not reach the bus feed. Check that the 'bus' edge function is deployed.";

/**
 * Turns a failed invoke into something worth reading.
 *
 * `error.context` is only a Response when the function answered with a non-2xx
 * - which is the case worth digging into, since the body carries the
 * function's own message. When the call never landed at all, the client puts
 * the underlying network error there instead, and it has none of the Response
 * methods. Everything below is therefore probed before it is called.
 */
async function describeInvokeError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown }).context;
  const res = context as Response | undefined;

  if (res && typeof res.text === "function") {
    try {
      // Cloning leaves the body readable for anyone else holding the response;
      // older clients hand over a plain object without it.
      const source = typeof res.clone === "function" ? res.clone() : res;
      const text = await source.text();
      try {
        const body = JSON.parse(text);
        if (body && typeof body.error === "string") return body.error;
      } catch {
        // A gateway erroring out sends back an HTML page, which is no use to
        // anyone reading it in a status line - fall through to the status.
        const trimmed = text.trim();
        if (trimmed && !trimmed.startsWith("<")) return trimmed.slice(0, 300);
      }
    } catch {
      // Body already consumed, or not readable. The status still says plenty.
    }
    if (typeof res.status === "number" && res.status > 0) {
      return res.status === 404
        ? UNREACHABLE
        : `The bus feed returned HTTP ${res.status}.`;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  // A blocked or missing function shows up as a bare fetch failure, whose
  // default wording ("Failed to fetch") explains nothing to an operator.
  if (!message || /failed to (fetch|send)|networkerror|load failed/i.test(message)) {
    return UNREACHABLE;
  }
  return message;
}

export async function fetchBuses(query: string): Promise<BusFeed> {
  const { data, error } = await supabase.functions.invoke<BusFeed | { error: string }>(
    "bus",
    { body: { q: query } },
  );

  if (error) throw new Error(await describeInvokeError(error));

  if (!data) throw new Error("The bus feed returned nothing.");
  if ("error" in data && typeof data.error === "string") throw new Error(data.error);
  return data as BusFeed;
}

export interface ServiceAlert {
  id: string;
  header: string;
  description?: string;
  url?: string;
  /** Route numbers affected. Empty means it could not be tied to a route. */
  routes: string[];
  effect?: string;
  cause?: string;
  starts?: number;
  ends?: number;
  source: "gtfs-rt" | "rss";
}

/**
 * Detours, cancellations and the rest, from OC Transpo.
 *
 * Fetched through the edge function for the same two reasons as the vehicle
 * feed: the alerts feed wants the subscription key, and octranspo.com sends
 * no CORS headers, so a browser could not read the RSS either way.
 */
export async function fetchAlerts(): Promise<ServiceAlert[]> {
  const { data, error } = await supabase.functions.invoke<
    { alerts: ServiceAlert[] } | { error: string }
  >("bus", { body: { alerts: 1 } });

  if (error) throw new Error(await describeInvokeError(error));
  if (!data) throw new Error("The alerts feed returned nothing.");
  if ("error" in data) throw new Error(data.error);
  return data.alerts ?? [];
}

/** Does this alert concern the route being looked at? */
export function alertAffects(alert: ServiceAlert, route: string): boolean {
  const want = route.trim().toUpperCase();
  return alert.routes.some((r) => r.toUpperCase() === want);
}

export interface BusPlace {
  /** What to show: "Fallowfield Road, Barrhaven". */
  label: string;
  road?: string;
  area?: string;
  /** OpenStreetMap's data is free to use, on condition it is credited. */
  attribution: string;
}

/**
 * The road a coordinate sits on.
 *
 * A latitude and a longitude is not an answer to "where is my bus", so the
 * pair is turned into a street name. The lookup runs in the edge function -
 * see supabase/functions/bus for why it cannot sensibly run in the page.
 */
export async function fetchPlace(
  lat: number,
  lon: number,
): Promise<BusPlace | { error: string }> {
  const { data, error } = await supabase.functions.invoke<
    BusPlace | { error: string }
  >("bus", { body: { lat, lon } });

  // A street name is a nicety on top of a position that is already shown, so
  // a failure never breaks the card. It is still reported rather than
  // swallowed - a name that quietly fails to appear is impossible to chase.
  if (error) return { error: await describeInvokeError(error) };
  if (!data) return { error: "The geocoder returned nothing." };
  return data;
}

/**
 * The feed's shape rather than its contents.
 *
 * Asked for when the feed reports no buses at all, which means the reader and
 * the gateway disagree about how the JSON is spelled. Running it from the
 * page rather than a terminal matters: other sites' content-security policies
 * block a fetch to Supabase from their console, and this is the one origin
 * that is allowed to make the call anyway.
 */
export async function fetchBusDebug(): Promise<string> {
  const { data, error } = await supabase.functions.invoke<unknown>("bus", {
    body: { debug: 1 },
  });
  if (error) throw new Error(await describeInvokeError(error));
  return JSON.stringify(data, null, 2);
}

/** Four digits is a fleet number, anything else is a route. */
export function looksLikeFleetNumber(q: string): boolean {
  return /^\d{4,5}$/.test(q.trim());
}

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function compass(bearing?: number): string | null {
  if (bearing === undefined || !Number.isFinite(bearing)) return null;
  return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16];
}

/** GTFS-Realtime reports speed in metres per second. */
export function kmh(speed?: number): number | null {
  if (speed === undefined || !Number.isFinite(speed)) return null;
  return Math.round(speed * 3.6);
}

export function agoLabel(sec: number): string {
  if (sec < 5) return "just now";
  if (sec < 60) return `${Math.round(sec)}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr} h ${min % 60} min ago`;
}

/** "4 min late", "2 min early", "on time". */
export function delayLabel(delay?: number): { text: string; tone: string } | null {
  if (delay === undefined || !Number.isFinite(delay)) return null;
  const min = Math.round(delay / 60);
  if (min === 0) return { text: "on time", tone: "ok" };
  if (min > 0) return { text: `${min} min late`, tone: min >= 5 ? "bad" : "warn" };
  return { text: `${-min} min early`, tone: min <= -3 ? "warn" : "ok" };
}

/**
 * GTFS-Realtime's currentStatus, in words an operator would use.
 */
export function statusLabel(status?: string): string | null {
  switch (status) {
    case "IN_TRANSIT_TO":
      return "in transit";
    case "STOPPED_AT":
      return "stopped at";
    case "INCOMING_AT":
      return "arriving at";
    default:
      return null;
  }
}

export function occupancyLabel(occupancy?: string): string | null {
  switch (occupancy) {
    case "EMPTY":
      return "empty";
    case "MANY_SEATS_AVAILABLE":
      return "lots of seats";
    case "FEW_SEATS_AVAILABLE":
      return "a few seats";
    case "STANDING_ROOM_ONLY":
      return "standing room";
    case "CRUSHED_STANDING_ROOM_ONLY":
      return "packed";
    case "FULL":
      return "full";
    case "NOT_ACCEPTING_PASSENGERS":
      return "not picking up";
    default:
      return null;
  }
}
