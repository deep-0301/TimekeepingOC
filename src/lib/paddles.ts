/**
 * The paddle books. Each is far too big to bundle - the fall weekday book
 * alone is 1.7 MB - so they are served from /public and fetched the first
 * time someone looks a paddle up on a date that needs one, then kept in
 * memory for the rest of the session.
 */

import {
  SEASONS,
  boardForDate,
  dayTypeLabel,
  type DayType,
  type SeasonId,
} from "./board";

/** [time, location] with an optional trailing 1 marking a relief point. */
export type PaddleStop = [string, string] | [string, string, number];

/** [route, destination, trip number, stops] */
export type PaddleTrip = [string, string, number | null, PaddleStop[]];

export interface Paddle {
  /** Paddle number, e.g. "005001". */
  p: string;
  /** Day type this paddle runs, e.g. "Weekdays". */
  d: string;
  /** Garage/division code printed as "(TG n)". */
  tg: number;
  /** Route numbers worked. */
  r: string[];
  /** Sign-on time and location. */
  on: string;
  onL: string;
  /** Sign-off time and location. */
  off: string;
  offL: string;
  /** Sign-on to sign-off, in minutes. */
  span: number;
  /** Sign-on and pull-out, before the first trip. */
  pre: PaddleStop[];
  /** Each trip in service, in order. */
  t: PaddleTrip[];
  /** Vehicle type when the book specifies one, e.g. "60IN", "VAN". */
  bus?: string;
  /** Set when the paddle signs off after midnight, the next calendar day. */
  next?: number;
  /** Pages the paddle occupies in the book, when it runs over the leaf. */
  pg?: number;
}

export interface PaddleBook {
  effective: string;
  dayType: string;
  paddles: Paddle[];
}

/**
 * Which book covers which season and day type.
 *
 * Not every combination exists yet: the summer weekend books have never been
 * supplied, so a summer Saturday has a board but no paddles. Missing is
 * different from empty and the UI has to be able to say so, which is why a
 * lookup returns null rather than an empty book.
 */
const BOOKS: Partial<Record<`${SeasonId}:${DayType}`, string>> = {
  "summer:weekday": "paddle-data-summer-weekday.json",
  "fall:weekday": "paddle-data-fall-weekday.json",
  "fall:saturday": "paddle-data-fall-saturday.json",
  "fall:sunday": "paddle-data-fall-sunday.json",
};

/** Every book the app knows about, including ones not yet supplied. */
export interface PaddleBookOption {
  key: string;
  season: SeasonId;
  dayType: DayType;
  label: string;
  /** null when that book has never been supplied. */
  file: string | null;
}

const BOOK_DAY_TYPES: DayType[] = ["weekday", "saturday", "sunday"];

/**
 * The books offered by the picker, missing ones included.
 *
 * A gap is worth showing rather than hiding: an operator who cannot find the
 * summer Saturday book should be able to see that it does not exist yet,
 * instead of concluding their paddle number is wrong.
 */
export function paddleBookOptions(): PaddleBookOption[] {
  const out: PaddleBookOption[] = [];
  for (const season of SEASONS) {
    for (const dayType of BOOK_DAY_TYPES) {
      const key = `${season.id}:${dayType}`;
      out.push({
        key,
        season: season.id,
        dayType,
        label: `${season.label} ${dayTypeLabel(dayType)}`,
        file: BOOKS[key as `${SeasonId}:${DayType}`] ?? null,
      });
    }
  }
  return out;
}

/**
 * The option a date falls on, for defaulting the picker.
 *
 * A holiday has its own board but no paddle book of its own, so it defaults
 * to that season's weekday book rather than to nothing.
 */
export function paddleBookKeyForDate(dateStr: string): string | null {
  const { season, dayType } = boardForDate(dateStr);
  if (!season) return null;
  const options = paddleBookOptions();
  const exact = `${season.id}:${dayType}`;
  if (options.some((o) => o.key === exact)) return exact;
  const weekday = `${season.id}:weekday`;
  return options.some((o) => o.key === weekday) ? weekday : null;
}

export function loadPaddleBookFile(file: string): Promise<PaddleBook> {
  return loadFile(file);
}

export interface PaddleBookRef {
  file: string;
  seasonLabel: string;
  dayType: DayType;
}

/** The book a date needs, or null when no book covers it. */
export function paddleBookForDate(dateStr: string): PaddleBookRef | null {
  const { season, dayType } = boardForDate(dateStr);
  if (!season) return null;
  const file = BOOKS[`${season.id}:${dayType}`];
  return file ? { file, seasonLabel: season.label, dayType } : null;
}

const cache = new Map<string, PaddleBook>();
const inFlight = new Map<string, Promise<PaddleBook>>();

function loadFile(file: string): Promise<PaddleBook> {
  const hit = cache.get(file);
  if (hit) return Promise.resolve(hit);
  const pending = inFlight.get(file);
  if (pending) return pending;

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const task = fetch(`${basePath}/${file}`)
    .then((r) => {
      if (!r.ok) throw new Error(`Could not load the paddle book (${r.status})`);
      return r.json() as Promise<PaddleBook>;
    })
    .then((book) => {
      cache.set(file, book);
      inFlight.delete(file);
      return book;
    })
    .catch((err) => {
      inFlight.delete(file);
      throw err;
    });

  inFlight.set(file, task);
  return task;
}

/** Raised when a date has a board but no paddle book has been supplied. */
export class NoPaddleBookError extends Error {}

export function loadPaddleBookForDate(dateStr: string): Promise<PaddleBook> {
  const ref = paddleBookForDate(dateStr);
  if (!ref) {
    return Promise.reject(
      new NoPaddleBookError(
        "No paddle book has been loaded for that date yet.",
      ),
    );
  }
  return loadFile(ref.file);
}

/** Already-loaded book for a date, for render paths that must stay synchronous. */
export function cachedPaddleBook(dateStr: string): PaddleBook | null {
  const ref = paddleBookForDate(dateStr);
  return ref ? (cache.get(ref.file) ?? null) : null;
}

const MAX_PADDLE_RESULTS = 40;

export interface PaddleSearch {
  results: Paddle[];
  truncated: boolean;
}

/**
 * Matches a paddle number, or a route number when the query is short enough
 * to be one. Paddle numbers are zero-padded, so "5001" finds "005001".
 */
export function searchPaddles(book: PaddleBook, query: string): PaddleSearch {
  const q = query.trim().toLowerCase();
  if (!q) return { results: [], truncated: false };

  const scored: { paddle: Paddle; rank: number }[] = [];
  for (const p of book.paddles) {
    const num = p.p.toLowerCase();
    const trimmed = num.replace(/^0+/, "");
    let rank = -1;
    if (num === q || trimmed === q) rank = 0;
    else if (num.startsWith(q) || trimmed.startsWith(q)) rank = 1;
    else if (num.includes(q)) rank = 2;
    else if (p.r.some((r) => r.toLowerCase() === q)) rank = 3;
    if (rank >= 0) scored.push({ paddle: p, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || a.paddle.p.localeCompare(b.paddle.p));
  return {
    results: scored.slice(0, MAX_PADDLE_RESULTS).map((s) => s.paddle),
    truncated: scored.length > MAX_PADDLE_RESULTS,
  };
}

export function isReliefStop(s: PaddleStop): boolean {
  return s.length > 2 && s[2] === 1;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

export interface PaddleGuess {
  paddle: Paddle;
  trip: PaddleTrip;
  tripIndex: number;
  /** Minutes from midnight of the sign-on day; may run past 1440. */
  startMin: number;
  endMin: number;
}

/**
 * Which paddles are working a given route at a given time of day.
 *
 * The realtime feed names the route and the GTFS trip, but the paddle book
 * knows nothing about GTFS trip ids, so the two can only be tied together by
 * route and clock. That makes this a shortlist rather than an answer - on a
 * frequent route several paddles are on the road at once.
 *
 * Paddle times are printed on a 24-hour clock and simply wrap past midnight,
 * so each paddle is walked in printed order with 24 h added every time the
 * clock goes backwards.
 */
export function paddlesOnRouteAt(
  book: PaddleBook,
  route: string,
  minOfDay: number,
): PaddleGuess[] {
  const want = route.trim().toLowerCase();
  if (!want) return [];

  const out: PaddleGuess[] = [];
  for (const paddle of book.paddles) {
    if (!paddle.r.some((r) => r.toLowerCase() === want)) continue;

    let prev = toMin(paddle.on);
    let offset = 0;

    paddle.t.forEach((trip, tripIndex) => {
      const stops = trip[3];
      if (stops.length === 0) return;

      // Unwrapped for every trip, not just matching ones, so the running
      // clock stays monotonic across the whole paddle.
      const abs = stops.map((s) => {
        let m = toMin(s[0]) + offset;
        if (m < prev) {
          offset += 1440;
          m += 1440;
        }
        prev = m;
        return m;
      });

      if (trip[0].toLowerCase() !== want) return;

      const startMin = abs[0];
      const endMin = abs[abs.length - 1];
      // Tested against tomorrow as well, so a paddle that signed on before
      // midnight still matches in the small hours.
      const inWindow =
        (minOfDay >= startMin && minOfDay <= endMin) ||
        (minOfDay + 1440 >= startMin && minOfDay + 1440 <= endMin);
      if (inWindow) out.push({ paddle, trip, tripIndex, startMin, endMin });
    });
  }

  out.sort((a, b) => a.startMin - b.startMin || a.paddle.p.localeCompare(b.paddle.p));
  return out;
}
