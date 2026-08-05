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
import type { Paddle, PaddleStop, PaddleTrip } from "./paddles";

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
  | { state: "layover"; nextRoute: string; nextDestination: string; nextStart: number }
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
    return {
      state: "layover",
      nextRoute: next.trip[0],
      nextDestination: next.trip[1],
      nextStart: next.mins[0],
    };
  }
  return { state: "done", signOff };
}

/** Minutes from midnight, wrapped back into a single day for display. */
export function clockLabel(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export interface VehicleMatch {
  vehicle: BusVehicle;
  /** Said plainly on the card, so a shortlist is never mistaken for a hit. */
  reason: string;
  /** The trip's own start time lines up - as close to certain as this gets. */
  confident: boolean;
}

/**
 * Which of the buses on the route could be working this paddle.
 *
 * When the feed reports a trip start time it is a strong signal: two buses on
 * the same route rarely begin a trip in the same minute, and the paddle knows
 * exactly when its trip was due to leave. Without it there is nothing left to
 * separate one bus on the route from another, and the list stays a list.
 */
export function matchVehicles(
  vehicles: BusVehicle[],
  segment: PaddleSegment,
): VehicleMatch[] {
  const due = segment.tripStartMin % 1440;
  const out = vehicles.map((vehicle) => {
    const started = vehicle.startTime ? toMin(vehicle.startTime) : null;
    const gap = started === null ? null : Math.abs(started - due);
    if (gap !== null && gap <= 1) {
      return {
        vehicle,
        confident: true,
        reason: `Its trip began at ${vehicle.startTime}, when this paddle's trip was due out.`,
      };
    }
    return {
      vehicle,
      confident: false,
      reason: `On route ${segment.route} now. The feed does not say which trip, so this is one of several.`,
    };
  });

  out.sort((a, b) => Number(b.confident) - Number(a.confident));
  return out;
}

/** The minute of the day the bus is really at, given how late it is running. */
export function scheduleMinuteFor(minOfDay: number, delaySec?: number): number {
  if (delaySec === undefined) return minOfDay;
  return minOfDay - Math.round(delaySec / 60);
}
