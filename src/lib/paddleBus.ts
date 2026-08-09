/**
 * Which bus is working a paddle, right now.
 *
 * This is the one question the app answers in two places - Find a Bus, and a
 * day in the calendar - and getting it wrong costs an operator a phone call.
 * So it is answered once, here, rather than twice in two components that
 * would drift apart.
 *
 * The answer is only ever knowable *today*. There is no historical vehicle
 * feed: which bus ran a paddle last Tuesday cannot be recovered, only
 * remembered from when it was running. That is why callers write the answer
 * down.
 */

import { fetchBuses, type BusFeed } from "./buses";
import { paddleForTrip, tripsForPaddle } from "./paddleTrips";
import {
  bestVehicle,
  paddleWhereAt,
  type MatchBasis,
  type PaddleMatch,
  type PaddleWhere,
} from "./paddleTracking";
import type { Paddle } from "./paddles";

export interface PaddleBusLookup {
  /** What the paddle is scheduled to be doing at this minute. */
  where: PaddleWhere;
  /** GTFS trips known to belong to this paddle, where the mapping covers it. */
  ownTrips: ReadonlySet<string>;
  /** The feed the answer came out of, for callers that render the vehicle. */
  feed: BusFeed | null;
  /** The bus, when one could be identified. */
  fleet: string | null;
  /**
   * What identified it.
   *
   * Callers that write the answer down should keep only "trip": that is the
   * feed naming a trip this paddle works, and it is the one basis that cannot
   * be a coincidence. A trip-start match is worth showing beside the evidence
   * for it, but not worth committing to a record that outlives the day.
   */
  basis: MatchBasis;
  /**
   * The decision itself, for callers that render it.
   *
   * Handed over rather than left to be worked out again: the screen used to
   * call bestVehicle a second time with only half the evidence - no record of
   * which buses belong to other paddles - so it could name a bus this lookup
   * had already ruled out. One decision, made once.
   */
  match: PaddleMatch | null;
  /** Unix seconds the position was reported, and where it was. */
  at: number | null;
  lat?: number;
  lon?: number;
  /** The paddle timepoint it was nearest, for when it drops off the feed. */
  place?: string;
}

function firstRouteOf(paddle: Paddle): string | null {
  return paddle.t.find((t) => t[3].length)?.[0] ?? null;
}

function lastRouteOf(paddle: Paddle): string | null {
  return [...paddle.t].reverse().find((t) => t[3].length)?.[0] ?? null;
}

/**
 * Ask the feed which bus is on this paddle.
 *
 * A paddle in service is on a route, so the route is fetched and the one bus
 * on a trip this paddle works is picked out - a lookup against the shipped
 * trip mapping, not a guess.
 *
 * Between trips the paddle is on no route and there is nothing to search by.
 * The bus is usually still reporting the trip it has just finished or the one
 * it is about to start, so the routes either side of the break are asked
 * instead and the answer is again matched by trip id.
 *
 * Returns `fleet: null` rather than a guess when nothing identifies the bus.
 */
export async function lookUpPaddleBus(
  /** Normalised six-digit paddle number. */
  number: string,
  paddle: Paddle,
  minOfDay: number,
): Promise<PaddleBusLookup> {
  const where = paddleWhereAt(paddle, minOfDay);

  if (where.state === "running") {
    const feed = await fetchBuses(where.segment.route);

    // Every reported trip is looked up once: it either belongs to this
    // paddle, or to another one - and knowing whose it is rules that bus out
    // as firmly as a match rules one in.
    const ownTrips = new Set<string>();
    const foreignTrips = new Set<string>();
    for (const v of feed.vehicles) {
      if (!v.tripId) continue;
      const worksIt = await paddleForTrip(v.tripId);
      if (worksIt === number) ownTrips.add(v.tripId);
      else if (worksIt) foreignTrips.add(v.tripId);
    }

    const match = bestVehicle(feed.vehicles, where.segment, ownTrips, foreignTrips);
    const found = match.best;
    return {
      where,
      ownTrips,
      feed,
      match,
      fleet: found?.fleet ?? null,
      basis: match.basis,
      at: found ? (found.ts ?? Math.floor(Date.now() / 1000)) : null,
      lat: found?.lat,
      lon: found?.lon,
      place: found ? where.segment.from[1] : undefined,
    };
  }

  const ownTrips = await tripsForPaddle(number);
  const nearby =
    where.state === "layover"
      ? [where.prevRoute, where.nextRoute]
      : where.state === "before"
        ? [firstRouteOf(paddle)]
        : [lastRouteOf(paddle)];

  for (const route of [...new Set(nearby.filter((r): r is string => !!r))]) {
    if (!ownTrips.size) break;
    const feed = await fetchBuses(route);
    const found = feed.vehicles.find((v) => v.tripId && ownTrips.has(v.tripId));
    if (!found) continue;
    return {
      where,
      ownTrips,
      feed: { ...feed, vehicles: [found] },
      // Off the road there is no segment to match against; the bus was found
      // by trip id, which is stronger than any comparison would have been.
      match: null,
      fleet: found.fleet ?? null,
      // Found by trip id, which is the same lookup the running path makes.
      basis: "trip",
      at: found.ts ?? Math.floor(Date.now() / 1000),
      lat: found.lat,
      lon: found.lon,
    };
  }

  return {
    where,
    ownTrips,
    feed: null,
    match: null,
    fleet: null,
    basis: "unidentified",
    at: null,
  };
}
