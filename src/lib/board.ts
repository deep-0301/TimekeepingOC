import summerWeekdayRaw from "@/data/board-data.json";
import summerSaturdayRaw from "@/data/board-data-summer-saturday.json";
import summerSundayRaw from "@/data/board-data-summer-sunday.json";
import fallWeekdayRaw from "@/data/board-data-fall-weekday.json";
import fallSaturdayRaw from "@/data/board-data-fall-saturday.json";
import fallSundayRaw from "@/data/board-data-fall-sunday.json";
import fallStatRaw from "@/data/board-data-fall-stat.json";
import { parseDateStr } from "./dateUtils";
import type { BoardShift } from "./types";

export type DayType = "weekday" | "saturday" | "sunday" | "stat";

/**
 * Days that run a holiday board rather than their calendar day's board.
 *
 * Listed date by date rather than derived from the stat-holiday calendar,
 * because the two are not the same thing. The Fall 2026 STAT board covers
 * Labour Day and Thanksgiving and nothing else - Remembrance Day falls inside
 * the same booking period and is not in it, so it runs ordinary weekday work
 * and must keep the weekday board.
 */
const STAT_BOARD_DATES: Record<string, string> = {
  "2026-09-07": "Labour Day",
  "2026-10-12": "Thanksgiving",
};

/** The holiday whose board a date runs, when it runs one. */
export function statBoardHoliday(dateStr: string): string | null {
  return STAT_BOARD_DATES[dateStr] ?? null;
}

export type SeasonId = "summer" | "fall";

interface SeasonDef {
  id: SeasonId;
  label: string;
  /** Inclusive booking range, as yyyy-mm-dd. */
  from: string;
  to: string;
}

/** Booking seasons, each with its own set of boards. */
export const SEASONS: SeasonDef[] = [
  { id: "summer", label: "Summer 2026", from: "2026-06-28", to: "2026-08-29" },
  { id: "fall", label: "Fall 2026", from: "2026-08-30", to: "2026-12-19" },
];

/** A contiguous stretch of BOARD_DATA holding one season's board. */
export interface BoardSegment {
  season: SeasonId;
  dayType: DayType;
  start: number;
  end: number;
  count: number;
}

const SOURCES: { season: SeasonId; dayType: DayType; rows: BoardShift[] }[] = [
  // Order matters and must never change: a shiftIndex saved in a user's data
  // is an index into BOARD_DATA, so new boards are only ever appended.
  {
    season: "summer",
    dayType: "weekday",
    rows: summerWeekdayRaw as unknown as BoardShift[],
  },
  {
    season: "fall",
    dayType: "weekday",
    rows: fallWeekdayRaw as unknown as BoardShift[],
  },
  {
    season: "fall",
    dayType: "saturday",
    rows: fallSaturdayRaw as unknown as BoardShift[],
  },
  {
    season: "fall",
    dayType: "sunday",
    rows: fallSundayRaw as unknown as BoardShift[],
  },
  {
    season: "summer",
    dayType: "saturday",
    rows: summerSaturdayRaw as unknown as BoardShift[],
  },
  {
    season: "summer",
    dayType: "sunday",
    rows: summerSundayRaw as unknown as BoardShift[],
  },
  {
    season: "fall",
    dayType: "stat",
    rows: fallStatRaw as unknown as BoardShift[],
  },
];

export const BOARD_DATA: BoardShift[] = [];
export const BOARD_SEGMENTS: BoardSegment[] = [];

for (const src of SOURCES) {
  const start = BOARD_DATA.length;
  BOARD_DATA.push(...src.rows);
  BOARD_SEGMENTS.push({
    season: src.season,
    dayType: src.dayType,
    start,
    end: BOARD_DATA.length,
    count: src.rows.length,
  });
}

export function dayTypeForDate(d: Date): DayType {
  const dow = d.getDay();
  if (dow === 6) return "saturday";
  if (dow === 0) return "sunday";
  return "weekday";
}

export function seasonForDate(d: Date): SeasonDef | null {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const iso = `${y}-${m}-${dd}`;
  return SEASONS.find((s) => iso >= s.from && iso <= s.to) ?? null;
}

export interface BoardContext {
  season: SeasonDef | null;
  dayType: DayType;
  segment: BoardSegment | null;
  /** True when the matching board has no shifts loaded. */
  empty: boolean;
}

/** Which board applies on a given date. */
export function boardForDate(dateStr: string): BoardContext {
  const d = parseDateStr(dateStr);
  const season = seasonForDate(d);
  const find = (dt: DayType) =>
    season == null
      ? null
      : (BOARD_SEGMENTS.find(
          (s) => s.season === season.id && s.dayType === dt
        ) ?? null);

  // A holiday board is used only where one has actually been loaded for that
  // season; otherwise the date falls back to its calendar day's board rather
  // than resolving to nothing.
  const statSegment = statBoardHoliday(dateStr) ? find("stat") : null;
  const dayType: DayType = statSegment ? "stat" : dayTypeForDate(d);
  const segment = statSegment ?? find(dayType);
  return {
    season,
    dayType,
    segment,
    empty: !segment || segment.count === 0,
  };
}

/** "Weekday", "Saturday", "Sunday", "Holiday". */
export function dayTypeLabel(dt: DayType): string {
  if (dt === "weekday") return "Weekday";
  if (dt === "saturday") return "Saturday";
  if (dt === "sunday") return "Sunday";
  return "Holiday";
}

/** "Fall 2026 Saturday", for naming a board in the UI. */
export function segmentLabel(seg: BoardSegment): string {
  const season = SEASONS.find((s) => s.id === seg.season);
  return `${season ? season.label : seg.season} ${dayTypeLabel(seg.dayType)}`;
}

/**
 * Boards in the order a person would list them, which is not the order they
 * are stored in - storage order is append-only so that saved shiftIndex
 * values keep pointing at the same work.
 */
export function segmentsForDisplay(): BoardSegment[] {
  const seasonRank = (id: SeasonId) => SEASONS.findIndex((s) => s.id === id);
  const dayRank: Record<DayType, number> = {
    weekday: 0,
    saturday: 1,
    sunday: 2,
    stat: 3,
  };
  return [...BOARD_SEGMENTS].sort(
    (a, b) =>
      seasonRank(a.season) - seasonRank(b.season) ||
      dayRank[a.dayType] - dayRank[b.dayType]
  );
}

/** Whether a date runs the board this segment holds. */
export function dateMatchesSegment(dateStr: string, seg: BoardSegment | null): boolean {
  if (!seg) return false;
  const b = boardForDate(dateStr);
  return b.segment === seg;
}

export function segmentOf(si: number): BoardSegment | null {
  return (
    BOARD_SEGMENTS.find((s) => si >= s.start && si < s.end) ?? null
  );
}

export interface RunIndexEntry {
  si: number;
  on: string;
  off: string;
  onloc: string;
  offloc: string;
  platmin: number;
}

/** Drops the trailing "Station"/"Garage" word for a compact display label. */
export function shortLocation(name: string): string {
  return name.replace(/\s+(Station|Garage)$/i, "");
}

/**
 * Where a shift signs on and signs off.
 *
 * Taken from the first piece's on location and the last piece's off location,
 * which on a split shift belong to different pieces - the middle pieces say
 * nothing about where the day starts or ends.
 */
export function shiftEndpoints(shift: BoardShift): {
  start: string;
  finish: string;
} {
  const runs = shift[3];
  if (runs.length === 0) return { start: "", finish: "" };
  return {
    start: shortLocation(runs[0][3]),
    finish: shortLocation(runs[runs.length - 1][4]),
  };
}

export const runIndex: Record<string, RunIndexEntry[]> = {};
BOARD_DATA.forEach((shift, si) => {
  shift[3].forEach((r) => {
    const [run, on, off, onloc, offloc, platmin] = r;
    if (!runIndex[run]) runIndex[run] = [];
    runIndex[run].push({ si, on, off, onloc, offloc, platmin });
  });
});

export interface ShiftSearchResult {
  si: number;
  shift: BoardShift;
  matchedRuns: Set<string>;
}

function inSegment(si: number, seg: BoardSegment | null): boolean {
  return seg ? si >= seg.start && si < seg.end : false;
}

/** Every distinct shift (by board index) that contains this exact paddle
 * number as one of its pieces. A paddle number can appear in more than one
 * shift, but within a shift it names one piece of a whole multi-piece
 * shift - the whole shift is what should be added, not just that piece.
 * Pass `dateStr` to restrict matches to the board that date actually runs. */
export function getShiftsForRun(
  run: string,
  dateStr?: string
): { si: number; shift: BoardShift }[] {
  const seg = dateStr ? boardForDate(dateStr).segment : null;
  const instances = runIndex[run] || [];
  const seen = new Set<number>();
  const out: { si: number; shift: BoardShift }[] = [];
  instances.forEach((inst) => {
    if (dateStr && !inSegment(inst.si, seg)) return;
    if (seen.has(inst.si)) return;
    seen.add(inst.si);
    out.push({ si: inst.si, shift: BOARD_DATA[inst.si] });
  });
  return out;
}

export interface BoardMatch {
  si: number;
  shift: BoardShift;
  /** Which piece of evidence tied the sheet to the board. */
  how: "runs+times" | "runs" | "shiftId";
  /** The sheet's pieces are the whole shift, not part of it. */
  complete: boolean;
}

/** One row off a booking sheet, as far as matching cares. */
export interface SheetPiece {
  run: string;
  onTime?: string | null;
  offTime?: string | null;
}

/** "3:53" and "03:53" are the same time; anything unparseable is null. */
function clock(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function multiset(values: string[]): string {
  return [...values].sort().join(",");
}

/**
 * Does every sheet piece line up with a distinct board run, matching on both
 * the run number and the clock times?
 */
function piecesLineUp(pieces: SheetPiece[], shift: BoardShift): boolean {
  const pool = shift[3].map((r) => ({ run: r[0], on: clock(r[1]), off: clock(r[2]) }));
  const used = new Array(pool.length).fill(false);

  for (const piece of pieces) {
    const on = clock(piece.onTime);
    const off = clock(piece.offTime);
    if (on === null || off === null) return false;
    const at = pool.findIndex(
      (b, i) => !used[i] && b.run === piece.run && b.on === on && b.off === off,
    );
    if (at === -1) return false;
    used[at] = true;
  }
  return true;
}

/**
 * Finds the board shift that a booking sheet block describes.
 *
 * A sheet prints the pieces an operator works and the shift number they
 * belong to, but its plat and pay figures are what a clerk typed - the board
 * is the schedule those figures are meant to describe. Tying the two together
 * lets the board supply the hours.
 *
 * Run numbers alone are not enough to identify a shift, which is the trap
 * here. A paddle is split between shifts: on the summer weekday board, 112-01
 * is worked by shift 723 in the morning and by shift 724 in the afternoon, so
 * both shifts carry exactly the same run number and their plat differs by
 * over an hour. Matching on run numbers alone got 185 of 3749 shifts wrong.
 * The clock times, which the sheet also prints, are what separate them.
 *
 * Where the evidence still leaves more than one genuinely different shift in
 * play, this returns null rather than guessing - the caller then keeps the
 * figures printed on the sheet. Matching is scoped to the board the date
 * actually runs, so a Saturday sheet cannot match weekday work.
 */
export function matchBoardShift(
  pieces: SheetPiece[],
  shiftId: string | null,
  dateStr: string,
): BoardMatch | null {
  const seg = boardForDate(dateStr).segment;
  if (!seg) return null;

  const wanted = pieces.filter((p) => p.run && p.run.trim() !== "");

  /** One winner, or nothing when the survivors are not interchangeable. */
  const decide = (
    hits: { si: number; shift: BoardShift }[],
    how: BoardMatch["how"],
    complete: boolean,
  ): BoardMatch | null => {
    if (hits.length === 0) return null;
    const first = hits[0];
    const allSame = hits.every(
      (h) => h.shift[1] === first.shift[1] && h.shift[2] === first.shift[2],
    );
    if (!allSame) return null;
    return { si: first.si, shift: first.shift, how, complete };
  };

  if (wanted.length > 0) {
    const candidates = getShiftsForRun(wanted[0].run, dateStr);
    const wantedRuns = multiset(wanted.map((p) => p.run));

    const sameRuns = candidates.filter(
      (c) => multiset(c.shift[3].map((r) => r[0])) === wantedRuns,
    );

    // Strongest: the whole shift, runs and times both agreeing.
    const exact = sameRuns.filter((c) => piecesLineUp(wanted, c.shift));
    const byTimes = decide(exact, "runs+times", true);
    if (byTimes) return byTimes;

    // Times missing or unreadable - runs alone will do, but only when the
    // survivors would pay the same either way.
    const byRuns = decide(sameRuns, "runs", true);
    if (byRuns) return byRuns;

    // A sheet can legitimately cover part of a shift, a relief taking over
    // half way through. That identifies the shift but not its full hours.
    const partial = candidates.filter((c) => piecesLineUp(wanted, c.shift));
    const byPartial = decide(partial, "runs+times", false);
    if (byPartial) return byPartial;
  }

  const wantedId = (shiftId || "").trim();
  if (wantedId) {
    const hits: { si: number; shift: BoardShift }[] = [];
    for (let si = seg.start; si < seg.end; si++) {
      if (BOARD_DATA[si][0] === wantedId) hits.push({ si, shift: BOARD_DATA[si] });
    }
    return decide(hits, "shiftId", true);
  }

  return null;
}

const MAX_RESULTS = 60;

export function searchRuns(
  query: string,
  dateStr?: string
): {
  results: ShiftSearchResult[];
  truncated: boolean;
} {
  return searchRunsInSegment(
    query,
    dateStr ? boardForDate(dateStr).segment : null,
    dateStr != null
  );
}

/**
 * The same search, scoped to a board chosen outright rather than derived from
 * a date - for the board picker, where the operator says which board they are
 * looking at.
 */
export function searchRunsInSegment(
  query: string,
  seg: BoardSegment | null,
  scoped = true
): {
  results: ShiftSearchResult[];
  truncated: boolean;
} {
  const q = query.trim().toLowerCase();
  if (!q) return { results: [], truncated: false };

  const matchingRuns = Object.keys(runIndex).filter((r) =>
    r.toLowerCase().includes(q)
  );

  const shiftMap = new Map<number, Set<string>>();
  matchingRuns.forEach((run) => {
    runIndex[run].forEach((inst) => {
      // `scoped` with a null segment means "a board was asked for and there
      // is none", which must return nothing rather than every board at once.
      if (scoped && !inSegment(inst.si, seg)) return;
      if (!shiftMap.has(inst.si)) shiftMap.set(inst.si, new Set());
      shiftMap.get(inst.si)!.add(run);
    });
  });

  const sorted = [...shiftMap.entries()].sort((a, b) => {
    const ta = BOARD_DATA[a[0]][3][0][1];
    const tb = BOARD_DATA[b[0]][3][0][1];
    return ta.localeCompare(tb);
  });

  const truncated = sorted.length > MAX_RESULTS;
  const results: ShiftSearchResult[] = sorted
    .slice(0, MAX_RESULTS)
    .map(([si, matchedRuns]) => ({ si, shift: BOARD_DATA[si], matchedRuns }));

  return { results, truncated };
}
