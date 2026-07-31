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

export async function fetchBuses(query: string): Promise<BusFeed> {
  const { data, error } = await supabase.functions.invoke<BusFeed | { error: string }>(
    "bus",
    { body: { q: query } },
  );

  if (error) {
    // The client wraps a non-2xx in FunctionsHttpError and hides the body on
    // the error itself, but the original response is still attached - and it
    // carries the message worth showing, like a rejected subscription key.
    const res = (error as { context?: Response }).context;
    if (res) {
      const body = await res
        .clone()
        .json()
        .catch(() => null);
      if (body && typeof body.error === "string") throw new Error(body.error);
    }
    throw new Error(
      error.message ||
        "Could not reach the bus feed. Check that the 'bus' function is deployed.",
    );
  }

  if (!data) throw new Error("The bus feed returned nothing.");
  if ("error" in data && typeof data.error === "string") throw new Error(data.error);
  return data as BusFeed;
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
