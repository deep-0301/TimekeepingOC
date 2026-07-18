import boardDataRaw from "@/data/board-data.json";
import type { BoardShift } from "./types";

export const BOARD_DATA = boardDataRaw as unknown as BoardShift[];

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

/** Every distinct shift (by board index) that contains this exact run
 * number as one of its pieces. A run number can appear in more than one
 * shift, but within a shift it names one piece of a whole multi-piece
 * shift - the whole shift is what should be added, not just that piece. */
export function getShiftsForRun(run: string): { si: number; shift: BoardShift }[] {
  const instances = runIndex[run] || [];
  const seen = new Set<number>();
  const out: { si: number; shift: BoardShift }[] = [];
  instances.forEach((inst) => {
    if (seen.has(inst.si)) return;
    seen.add(inst.si);
    out.push({ si: inst.si, shift: BOARD_DATA[inst.si] });
  });
  return out;
}

const MAX_RESULTS = 60;

export function searchRuns(query: string): {
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
