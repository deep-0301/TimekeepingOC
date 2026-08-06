/**
 * Which paddle works which GTFS trip.
 *
 * A GTFS *block* is one vehicle's day of work, which is exactly what a paddle
 * is. Nothing in either dataset says so - OC Transpo's block ids are internal
 * numbers and the GTFS never mentions a paddle - but they describe the same
 * day, so `scripts/build-paddle-trips.py` matches them on the route and start
 * time of every trip and writes the result out.
 *
 * With that in hand the guessing stops. The realtime feed names the trip a
 * bus is on; this names the paddle that trip belongs to. It is a lookup, not
 * an inference: no clock arithmetic, no shortlist.
 *
 * The mapping only holds for the booking period the GTFS feed covers, so it
 * carries the feed's dates and is refused outside them. A stale mapping would
 * name a bus with total confidence and be wrong, which is the one outcome
 * worth going out of the way to avoid.
 */

interface TripsFile {
  source: string;
  version: string;
  /** yyyymmdd. */
  start: string;
  end: string;
  /** GTFS route id -> the number on the bus, where they differ. */
  routes: Record<string, string>;
  /** GTFS trip id -> paddle number. */
  trips: Record<string, string>;
}

let cache: Promise<TripsFile | null> | null = null;

function load(): Promise<TripsFile | null> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  cache ??= fetch(`${basePath}/paddle-trips.json`)
    .then((res) => (res.ok ? (res.json() as Promise<TripsFile>) : null))
    // The mapping is an improvement on the guess, never a prerequisite for
    // it, so a missing or broken file leaves everything else working.
    .catch(() => null);
  return cache;
}

function ymd(date: Date): string {
  return (
    `${date.getFullYear()}` +
    `${String(date.getMonth() + 1).padStart(2, "0")}` +
    `${String(date.getDate()).padStart(2, "0")}`
  );
}

/** The mapping, only if it covers the day being asked about. */
async function usable(when: Date): Promise<TripsFile | null> {
  const file = await load();
  if (!file) return null;
  const day = ymd(when);
  return day >= file.start && day <= file.end ? file : null;
}

/**
 * The paddle working a given GTFS trip, or null if it cannot be said.
 *
 * Null covers three cases that all deserve the same treatment: the mapping
 * is missing, it is from another booking period, or that trip's block could
 * not be tied to a paddle. In all three the caller falls back to matching on
 * the clock.
 */
export async function paddleForTrip(
  tripId: string | undefined,
  when: Date = new Date(),
): Promise<string | null> {
  if (!tripId) return null;
  const file = await usable(when);
  return file?.trips[tripId] ?? null;
}

/** When the shipped mapping stops being trustworthy, as yyyy-mm-dd. */
export async function tripsExpiry(): Promise<string | null> {
  const file = await load();
  if (!file) return null;
  return `${file.end.slice(0, 4)}-${file.end.slice(4, 6)}-${file.end.slice(6, 8)}`;
}
