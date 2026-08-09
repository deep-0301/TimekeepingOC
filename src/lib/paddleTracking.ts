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
 * How far apart two clock times are, going round the dial.
 *
 * Work that runs past midnight is written both ways: the schedule keeps
 * counting up, so a trip out at half past one in the morning is "25:30", and
 * the paddle book restarts at zero and prints "1:30". Subtracting those gives
 * a day's difference for two times a minute apart. Both are wrapped into one
 * day and compared the short way round, so 23:59 and 00:00 are a minute
 * apart rather than a day.
 */
function minutesApart(a: number, b: number): number {
  const gap = Math.abs((((a - b) % 1440) + 1440) % 1440);
  return Math.min(gap, 1440 - gap);
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
      if (minutesApart(toMin(trip[3][0][0]), due) <= 1) {
        found.push(paddle);
        break;
      }
    }
    if (found.length > 1) return null;
  }
  return found[0] ?? null;
}

/** How the one bus was picked out, or why it could not be. */
export type MatchBasis = "trip" | "trip-start" | "unidentified";

export interface PaddleMatch {
  /** The bus working this paddle, or null when the feed cannot say. */
  best: BusVehicle | null;
  basis: MatchBasis;
  /** Everything else on the route, kept for when the answer looks wrong. */
  others: BusVehicle[];
}

/**
 * Whether two route names are the same route.
 *
 * The book prints the number on the bus - "88" - while a feed can report the
 * GTFS route id it belongs to, "88-371-1". Reducing both to the part before
 * the first dash is the same rule the edge function uses to turn a route id
 * into a route number, so the two sides agree by construction.
 */
function sameRoute(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const number = (r: string) => r.trim().toUpperCase().split("-")[0].replace(/[^A-Z0-9]/g, "");
  return number(a) === number(b);
}

/**
 * The one bus working this paddle.
 *
 * Naming the wrong bus is worse than naming none - it costs an operator a
 * phone call, or a walk to the wrong end of a garage - so a bus is returned
 * only when something actually identifies it.
 *
 * Three things can be known, in descending order of how much they are worth:
 *
 *   1. The feed says which trip the bus is on and that trip belongs to this
 *      paddle. A lookup, not a guess, and settled before anything else.
 *   2. The feed says which trip the bus is on and that trip belongs to some
 *      *other* paddle. That names nobody, but it rules this bus out, which is
 *      just as useful and was previously ignored.
 *   3. Its trip began when this paddle's trip was due out, on this paddle's
 *      route. Weaker - two buses can leave in the same minute - so it is
 *      taken only from buses not already ruled out.
 *
 * What is deliberately not here: naming the only bus reporting on the route.
 * That was an answer with no evidence behind it at all. Most of a route's
 * buses are invisible to a route query between trips, so "the only one" is
 * routinely the only one *reporting*, not the only one running - and the
 * paddle being asked about is quite often not it.
 */
export function bestVehicle(
  vehicles: BusVehicle[],
  segment: PaddleSegment,
  /** GTFS trip ids known to belong to this paddle, where that is known. */
  ownTrips?: ReadonlySet<string>,
  /** Trip ids known to belong to a different paddle, which rule a bus out. */
  foreignTrips?: ReadonlySet<string>,
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

  // A bus on a trip that belongs to someone else is not this paddle's,
  // whatever its clock says. Ruling those out first is what stops a
  // neighbouring run being handed over on a coincidence of timing.
  const plausible = foreignTrips?.size
    ? vehicles.filter((v) => !(v.tripId && foreignTrips.has(v.tripId)))
    : vehicles;

  const due = segment.tripStartMin % 1440;

  // Closest trip start inside a minute either way, and only from a bus on
  // this paddle's own route. The tolerance covers the feed rounding to the
  // second and the book printing to the minute; the route check stops a bus
  // the query happened to return from winning on timing alone.
  let best: BusVehicle | null = null;
  let bestGap = Infinity;
  for (const v of plausible) {
    if (!v.startTime) continue;
    if (v.route && !sameRoute(v.route, segment.route)) continue;
    const gap = minutesApart(toMin(v.startTime), due);
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

  return { best: null, basis: "unidentified", others: vehicles };
}

/** The minute of the day the bus is really at, given how late it is running. */
export function scheduleMinuteFor(minOfDay: number, delaySec?: number): number {
  if (delaySec === undefined) return minOfDay;
  return minOfDay - Math.round(delaySec / 60);
}
