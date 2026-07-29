/**
 * The Summer 2026 paddle book (Mon-Fri). It is far too big to bundle, so it
 * is served from /public and fetched the first time someone looks a paddle
 * up, then kept in memory for the rest of the session.
 */

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

let cache: PaddleBook | null = null;
let inFlight: Promise<PaddleBook> | null = null;

export function loadPaddleBook(): Promise<PaddleBook> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  inFlight = fetch(`${basePath}/paddle-data.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Could not load the paddle book (${r.status})`);
      return r.json() as Promise<PaddleBook>;
    })
    .then((book) => {
      cache = book;
      inFlight = null;
      return book;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}

/** Already-loaded book, for render paths that must stay synchronous. */
export function cachedPaddleBook(): PaddleBook | null {
  return cache;
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
