/**
 * Going the other way: from a paddle number to the bus working it.
 *
 * The realtime feed knows routes, GTFS trip ids and coordinates. The paddle
 * book knows paddle numbers, timepoints and street corners. Nothing is shared
 * between them, so the join has to be made out of route and clock: work out
 * what the paddle is scheduled to be doing at this minute, then look at the
 * buses on that route.
 *
 * That is a shortlist, not a certainty, and the code below says which of the
 * two it is on every result rather than presenting a guess as an answer.
 */

import type { BusVehicle } from "./buses";
import type { Paddle, PaddleBook, PaddleStop, PaddleTrip } from "./paddles";

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * The same paddle written either way.
 *
 * The paddle book prints `085002`; the work board and the booking sheet print
 * `85-02`. Operators read both, so both are accepted and normalised to the
 * book's spelling - route padded to three digits, paddle padded to three.
 */
export function normalisePaddleNumber(query: string): string | null {
  const q = query.trim();
  if (/^\d{6}$/.test(q)) return q;
  const split = q.match(/^(\d{1,3})\s*[-/\s]\s*(\d{1,3})$/);
  if (split) return split[1].padStart(3, "0") + split[2].padStart(3, "0");
  return null;
}

export function looksLikePaddleNumber(query: string): boolean {
  return normalisePaddleNumber(query) !== null;
}

interface AbsoluteTrip {
  trip: PaddleTrip;
  index: number;
  /** Timepoint minutes, unwrapped past midnight so they only ever increase. */
  mins: number[];
}

/**
 * The paddle laid out on a single rising clock.
 *
 * Printed times restart at 0:00 after midnight, so a late paddle looks like
 * it jumps backwards. Walking every trip in printed order and adding 24 h
 * each time the clock goes back gives one timeline that can be compared
 * against the time of day.
 */
function timeline(paddle: Paddle): {
  trips: AbsoluteTrip[];
  signOn: number;
  signOff: number;
} {
  const signOn = toMin(paddle.on);
  let prev = signOn;
  let offset = 0;

  const trips = paddle.t.map((trip, index) => {
    const mins = trip[3].map((s) => {
      let m = toMin(s[0]) + offset;
      if (m < prev) {
        offset += 1440;
        m += 1440;
      }
      prev = m;
      return m;
    });
    return { trip, index, mins };
  });

  let signOff = toMin(paddle.off) + offset;
  if (signOff < prev) signOff += 1440;

  return { trips, signOn, signOff };
}

export interface PaddleSegment {
  trip: PaddleTrip;
  tripIndex: number;
  route: string;
  destination: string;
  /** When this trip was due out, for lining up against the feed's trip. */
  tripStartMin: number;
  /** The timepoint just passed, and the one being run to. */
  from: PaddleStop;
  to: PaddleStop;
  /** True when the bus is due at `from` this minute rather than past it. */
  atStop: boolean;
  /** How far through the leg, 0 to 1, for a progress bar. */
  progress: number;
}

export type PaddleWhere =
  | { state: "before"; signOn: number; firstTripStart: number | null }
  | { state: "running"; segment: PaddleSegment }
  | {
      state: "layover";
      nextRoute: string;
      nextDestination: string;
      nextStart: number;
      /** The route just finished, for finding a bus that is between trips. */
      prevRoute: string | null;
    }
  | { state: "done"; signOff: number };

/**
 * What the paddle is scheduled to be doing at a given minute of the day.
 *
 * `minOfDay` is checked against tomorrow as well, so a paddle that signed on
 * before midnight is still found in the small hours.
 */
export function paddleWhereAt(paddle: Paddle, minOfDay: number): PaddleWhere {
  const { trips, signOn, signOff } = timeline(paddle);

  const now = [minOfDay, minOfDay + 1440].find((t) => t >= signOn && t <= signOff);
  if (now === undefined) {
    const first = trips.find((t) => t.mins.length > 0);
    return minOfDay < signOn
      ? { state: "before", signOn, firstTripStart: first ? first.mins[0] : null }
      : { state: "done", signOff };
  }

  for (const { trip, index, mins } of trips) {
    if (mins.length === 0) continue;
    if (now < mins[0] || now > mins[mins.length - 1]) continue;

    let i = 0;
    while (i < mins.length - 2 && now >= mins[i + 1]) i += 1;
    const span = mins[i + 1] - mins[i];
    return {
      state: "running",
      segment: {
        trip,
        tripIndex: index,
        route: trip[0],
        destination: trip[1],
        tripStartMin: mins[0],
        from: trip[3][i],
        to: trip[3][i + 1],
        atStop: now === mins[i],
        progress: span > 0 ? Math.min(1, Math.max(0, (now - mins[i]) / span)) : 0,
      },
    };
  }

  const next = trips.find((t) => t.mins.length > 0 && t.mins[0] > now);
  if (next) {
    const previous = [...trips]
      .reverse()
      .find((t) => t.mins.length > 0 && t.mins[t.mins.length - 1] <= now);
    return {
      state: "layover",
      nextRoute: next.trip[0],
      nextDestination: next.trip[1],
      nextStart: next.mins[0],
      prevRoute: previous ? previous.trip[0] : null,
    };
  }
  return { state: "done", signOff };
}

/** Minutes from midnight, wrapped back into a single day for display. */
export function clockLabel(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * The paddle whose trip left at this time on this route.
 *
 * The way back when the trip id is no help - either the trip belongs to a
 * block that could not be tied to a paddle, or the realtime feed numbers its
 * trips differently from the static schedule. Neither is visible from here,
 * and neither needs to be: a route and a departure minute identify a trip on
 * their own, because two trips on a route do not leave in the same minute.
 *
 * Answers only when exactly one paddle claims that departure. Where two do,
 * the paddle book itself cannot tell them apart and neither can we.
 */
export function paddleWorkingTrip(
  book: PaddleBook,
  route: string,
  startTime: string,
): Paddle | null {
  const want = route.trim().toLowerCase();
  const due = toMin(startTime);
  if (!want || !Number.isFinite(due)) return null;

  const found: Paddle[] = [];
  for (const paddle of book.paddles) {
    for (const trip of paddle.t) {
      if (trip[0].toLowerCase() !== want || trip[3].length === 0) continue;
      // A minute either way, since the feed counts seconds and the book
      // prints whole minutes.
      if (Math.abs(toMin(trip[3][0][0]) - due) <= 1) {
        found.push(paddle);
        break;
      }
    }
    if (found.length > 1) return null;
  }
  return found[0] ?? null;
}

/** How the one bus was picked out, or why it could not be. */
export type MatchBasis = "trip" | "trip-start" | "only-bus" | "unidentified";

export interface PaddleMatch {
  /** The bus working this paddle, or null when the feed cannot say. */
  best: BusVehicle | null;
  basis: MatchBasis;
  /** Everything else on the route, kept for when the answer looks wrong. */
  others: BusVehicle[];
}

/**
 * The one bus working this paddle.
 *
 * The trip's start time is the only identifier the two sides share. Two buses
 * on a route rarely begin a trip in the same minute, and the paddle knows
 * exactly when its trip was due out, so a match there names the bus.
 *
 * Where that fails, guessing would be worse than not answering: handing an
 * operator the wrong bus number costs them a phone call. So a single bus is
 * returned only when something actually identifies it, and the rest of the
 * route is kept aside rather than presented as an answer.
 */
export function bestVehicle(
  vehicles: BusVehicle[],
  segment: PaddleSegment,
  /** GTFS trip ids known to belong to this paddle, where that is known. */
  ownTrips?: ReadonlySet<string>,
): PaddleMatch {
  // The strong case: the feed says which trip the bus is on, and the trip is
  // one this paddle works. That is a lookup rather than a guess, so it is
  // settled before anything is measured against the clock.
  if (ownTrips?.size) {
    const onOurTrip = vehicles.find((v) => v.tripId && ownTrips.has(v.tripId));
    if (onOurTrip) {
      return {
        best: onOurTrip,
        basis: "trip",
        others: vehicles.filter((v) => v !== onOurTrip),
      };
    }
  }

  const due = segment.tripStartMin % 1440;

  // Closest trip start inside a minute either way. The tolerance covers the
  // feed rounding to the second and the book printing to the minute.
  let best: BusVehicle | null = null;
  let bestGap = Infinity;
  for (const v of vehicles) {
    if (!v.startTime) continue;
    const gap = Math.abs(toMin(v.startTime) - due);
    if (gap <= 1 && gap < bestGap) {
      best = v;
      bestGap = gap;
    }
  }
  if (best) {
    const chosen = best;
    return {
      best: chosen,
      basis: "trip-start",
      others: vehicles.filter((v) => v !== chosen),
    };
  }

  // Nothing to choose between when there is nothing else on the route.
  if (vehicles.length === 1) {
    return { best: vehicles[0], basis: "only-bus", others: [] };
  }

  return { best: null, basis: "unidentified", others: vehicles };
}

/** The minute of the day the bus is really at, given how late it is running. */
export function scheduleMinuteFor(minOfDay: number, delaySec?: number): number {
  if (delaySec === undefined) return minOfDay;
  return minOfDay - Math.round(delaySec / 60);
}
