import type { Paddle, PaddleStop } from "./paddles";

/**
 * A paddle, cut into the sections a timeline draws: the sign-on, then one
 * per trip in service.
 *
 * This lives apart from the component that renders it because the awkward
 * part is arithmetic rather than markup - a paddle can run past midnight,
 * and an operator often works only a stretch of one - and arithmetic is
 * worth being able to test on its own.
 */
export interface Section {
  key: string;
  route: string;
  dest: string;
  num: number | null;
  garage: boolean;
  stops: PaddleStop[];
  /** Starts on the day after the paddle signed on. */
  nextDay: boolean;
  lastIsSignOff: boolean;
  /** Minutes from the paddle's own midnight, counting on past 24:00. */
  fromMin: number;
  toMin: number;
}

/**
 * The stretch of a paddle one operator actually works, in minutes of the day.
 *
 * A paddle is a bus's whole day; a relief hands it to somebody else part-way
 * through. An operator looking at their own day wants their own stretch of it,
 * not the twelve hours the bus is out.
 */
export interface Window {
  fromMin: number;
  toMin: number;
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** One stretch of a day: a run number and the hours actually worked on it. */
export interface WorkedPiece {
  run: string;
  onTime: string;
  offTime: string;
  onLoc: string;
  offLoc: string;
}

/**
 * Pieces as the board prints them, tidied into the stretches actually worked.
 *
 * Two consecutive pieces of the same run that meet end to end are one stretch
 * with a bookkeeping split in the middle, not a break - showing a "0m break"
 * between them would be noise.
 */
export function joinPieces<T extends WorkedPiece>(pieces: T[]): T[] {
  const out: T[] = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && last.run === p.run && last.offTime === p.onTime) {
      out[out.length - 1] = { ...last, offTime: p.offTime, offLoc: p.offLoc };
      continue;
    }
    out.push({ ...p });
  }
  return out;
}

/**
 * The window one piece covers, counting a finish before its start as being
 * on the next day rather than earlier the same morning.
 */
export function pieceWindow(piece: WorkedPiece): Window {
  const fromMin = toMinutes(piece.onTime);
  let toMin = toMinutes(piece.offTime);
  if (toMin < fromMin) toMin += 1440;
  return { fromMin, toMin };
}

/**
 * The same window, measured from the paddle's own midnight.
 *
 * `buildSections` counts on past 24:00 from the moment the paddle signed on,
 * so a piece worked after midnight on a paddle that went out the evening
 * before has to be counted the same way or it would look like it happened
 * eighteen hours too early.
 */
export function windowInPaddle(paddle: Paddle, piece: WorkedPiece): Window {
  const signOn = toMinutes(paddle.on);
  let fromMin = toMinutes(piece.onTime);
  if (fromMin < signOn - 180) fromMin += 1440;
  let toMin = toMinutes(piece.offTime);
  while (toMin < fromMin) toMin += 1440;
  return { fromMin, toMin };
}

/**
 * What to call the gap between two pieces.
 *
 * Anything over an hour is a split - the day is genuinely broken in two and
 * the gap is the operator's own time. An hour or less is the CLC break the
 * run carries, which is paid.
 */
export function breakLabel(mins: number): string {
  return mins > 60 ? "Split break" : "CLC break";
}

/** A gap between two pieces, written the way an operator says it. */
export function spanLabel(fromMin: number, toMin: number): string {
  const mins = Math.max(0, toMin - fromMin);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * A paddle's trips, optionally narrowed to the stretch one operator worked.
 *
 * The whole paddle is always walked, even when a window throws most of it
 * away: past midnight the printed clock restarts at 0:00, and the only way
 * to know a 0:14 trip belongs to tomorrow is to have seen the trips before
 * it. Filtering first would lose that.
 */
export function buildSections(paddle: Paddle, win?: Window | null): Section[] {
  const out: Section[] = [];
  let prev = -1;
  let dayOffset = 0;

  const add = (
    key: string,
    route: string,
    dest: string,
    num: number | null,
    garage: boolean,
    stops: PaddleStop[],
    lastIsSignOff: boolean
  ) => {
    let startsNextDay = dayOffset > 0;
    let from = -1;
    let to = -1;
    stops.forEach((s, i) => {
      const v = toMinutes(s[0]);
      if (prev >= 0 && v < prev - 180) {
        dayOffset += 1;
        if (i === 0) startsNextDay = true;
      }
      prev = v;
      const abs = v + dayOffset * 1440;
      if (from < 0) from = abs;
      to = abs;
    });
    out.push({
      key,
      route,
      dest,
      num,
      garage,
      stops,
      nextDay: startsNextDay,
      lastIsSignOff,
      fromMin: from,
      toMin: to,
    });
  };

  add("pre", "Sign on", "Pull out of the garage", null, true, paddle.pre, false);
  paddle.t.forEach(([route, dest, num, stops], ti) =>
    add(`t${ti}`, route, dest, num, false, stops, ti === paddle.t.length - 1)
  );

  if (!win) return out;

  // A trip counts as worked if it overlaps the window at all - one that
  // starts before the relief and ends after it was still driven by the
  // operator who took it out. Signing on is an instant rather than a
  // stretch, so it is kept whenever it falls inside the window.
  return out.filter((s) => {
    if (s.fromMin < 0) return false;
    if (s.fromMin === s.toMin) {
      return s.fromMin >= win.fromMin && s.fromMin <= win.toMin;
    }
    return s.fromMin < win.toMin && s.toMin > win.fromMin;
  });
}
