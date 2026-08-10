/**
 * Which bus worked a run on a day nobody was watching.
 *
 * The app writes down a bus while an operator has the day open and the bus is
 * on the road. That covers today and nothing else, because there is no
 * historical vehicle feed to go back to.
 *
 * The recorder fills the rest in: it watches the feed all day and keeps one
 * row per run per bus, with a count of how often that bus was seen there. So
 * a day that was never opened still has an answer, and the answer is whichever
 * bus was seen most - a terminus mix-up that scores one does not displace the
 * bus that worked the run all morning.
 */

import { supabase } from "./supabaseClient";

/** Codes PostgREST returns when the history has not been set up yet. */
const NOT_SET_UP = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);

export class HistoryNotSetUpError extends Error {
  constructor() {
    super("The bus history table has not been created yet.");
    this.name = "HistoryNotSetUpError";
  }
}

export interface HistoryBus {
  fleet: string;
  /** How many times it was seen on this run that day. */
  sightings: number;
  /** ISO timestamps of the first and last sighting. */
  firstSeen: string;
  lastSeen: string;
}

export type HistoryByPaddle = Record<string, HistoryBus>;

interface Row {
  paddle: string;
  fleet: string;
  sightings: number;
  first_seen: string;
  last_seen: string;
}

/**
 * The bus each of these runs had on this date.
 *
 * Returns only the winner per run. Where two buses worked one run - a swap
 * mid-day, which does happen - the one seen most is the one an operator means
 * when they ask what bus they had.
 */
export async function historyFor(
  dateStr: string,
  paddles: string[],
): Promise<HistoryByPaddle> {
  if (paddles.length === 0) return {};

  const { data, error } = await supabase
    .from("bus_history")
    .select("paddle, fleet, sightings, first_seen, last_seen")
    .eq("service_date", dateStr)
    .in("paddle", paddles);

  if (error) {
    if (NOT_SET_UP.has(error.code ?? "")) throw new HistoryNotSetUpError();
    throw new Error(error.message);
  }

  const best: HistoryByPaddle = {};
  for (const row of (data ?? []) as Row[]) {
    const held = best[row.paddle];
    // Ties go to the bus seen first, which is the one that took the run out.
    if (held && held.sightings >= row.sightings) continue;
    best[row.paddle] = {
      fleet: row.fleet,
      sightings: row.sightings,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
    };
  }
  return best;
}
