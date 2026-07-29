import summerWeekdayRaw from "@/data/board-data.json";
import summerWeekendRaw from "@/data/board-data-weekend.json";
import fallWeekdayRaw from "@/data/board-data-fall-weekday.json";
import fallSaturdayRaw from "@/data/board-data-fall-saturday.json";
import fallSundayRaw from "@/data/board-data-fall-sunday.json";
import { parseDateStr } from "./dateUtils";
import type { BoardShift } from "./types";

export type DayType = "weekday" | "saturday" | "sunday";
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
  { id: "summer", label: "Summer 2026", from: "2026-06-29", to: "2026-08-29" },
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
    season: "summer",
    dayType: "saturday",
    rows: summerWeekendRaw as unknown as BoardShift[],
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
  const dayType = dayTypeForDate(d);
  const season = seasonForDate(d);
  const segment =
    season == null
      ? null
      : BOARD_SEGMENTS.find(
          (s) => s.season === season.id && s.dayType === dayType
        ) ?? null;
  return {
    season,
    dayType,
    segment,
    empty: !segment || segment.count === 0,
  };
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
  return seg ? si >= seg.start && si < seg.end : true;
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

const MAX_RESULTS = 60;

export function searchRuns(
  query: string,
  dateStr?: string
): {
  results: ShiftSearchResult[];
  truncated: boolean;
} {
  const q = query.trim().toLowerCase();
  if (!q) return { results: [], truncated: false };
  const seg = dateStr ? boardForDate(dateStr).segment : null;

  const matchingRuns = Object.keys(runIndex).filter((r) =>
    r.toLowerCase().includes(q)
  );

  const shiftMap = new Map<number, Set<string>>();
  matchingRuns.forEach((run) => {
    runIndex[run].forEach((inst) => {
      if (dateStr && !inSegment(inst.si, seg)) return;
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
