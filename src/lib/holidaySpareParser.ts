import { extractTimeTokens, hmToMin } from "./bookingSheetParser";
import { fmtDate } from "./dateUtils";
import { canonicalGarage } from "./garages";

/**
 * Parses the weekly booking sheet - a completely different layout from the
 * pattern sheets (see bookingSheetParser.ts). One document covers the whole
 * season, organised as "WEEK N  <date> TO <date>" blocks. Inside a week:
 *
 * - rows before any day heading are the week's default, worked Monday to
 *   Friday;
 * - a "<Weekday> - N" heading gives that one day its own rows, which replace
 *   the default for that day alone;
 * - "Day Off <Weekday> - N" takes the day out altogether.
 *
 * A row is one of three things: real work (a numbered shift and its runs), a
 * garage spare with a report time printed on it (M0515, I0400, A1230), or a
 * floating spare (FSP, FSPE, FSPEE) where the operator is called the day
 * before and told whether they are working or standing by.
 *
 * The text arrives from OCR, so nothing here assumes a clean line. A week is
 * opened by the first date on its heading rather than by a whole range; a day
 * heading is matched against the weekday it most nearly spells. Whatever
 * still cannot be read is handed back rather than dropped, because a line
 * nobody accounted for is a day of somebody's pay.
 */

export interface HolidayRunPiece {
  run: string;
  shiftId: string;
  onLoc: string;
  onTime: string;
  offTime: string;
  offLoc: string;
  platMin: number;
}

export type HolidayDayKind = "spare_manual" | "spare_timed" | "dayoff" | "work";

export interface HolidayDayPlan {
  dateStr: string;
  weekLabel: string;
  kind: HolidayDayKind;
  guaranteeHrs?: number;
  garage?: string;
  startMin?: number;
  pieces?: HolidayRunPiece[];
  /**
   * A floating spare: the operator is phoned the day before and chooses
   * work or spare, so the day cannot be settled at import time.
   */
  floating?: boolean;
  sourceNote: string;
}

/** What the sheet said that could not be turned into a day. */
export interface SheetGap {
  weekLabel: string;
  line: string;
  why: string;
}

export interface ParsedSheet {
  plans: HolidayDayPlan[];
  gaps: SheetGap[];
}

const WEEKDAY_FULL_NAMES = {
  sun: "sunday",
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
} as const;
type WeekdayKey = keyof typeof WEEKDAY_FULL_NAMES;
const WEEK_ORDER: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_KEYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri"];

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function parseMDY(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Levenshtein distance, small strings only. */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * The weekday a word was meant to be.
 *
 * OCR turns "Thursday" into "Thwrsday" and "Friday" into "fiday" often
 * enough that matching the spelling exactly loses whole days of work. Two
 * wrong letters is close enough to be certain and far enough from any other
 * weekday to be unambiguous.
 */
function weekdayNear(word: string): WeekdayKey | null {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length < 5) return null;
  let best: WeekdayKey | null = null;
  let bestD = 3;
  for (const k of WEEK_ORDER) {
    const d = editDistance(w, WEEKDAY_FULL_NAMES[k]);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Locations the sheet uses as a description rather than a place. */
function isGenericPlace(s: string): boolean {
  const t = s.toLowerCase().replace(/[^a-z]/g, "");
  return (
    t === "" ||
    t === "spare" ||
    t === "pm" ||
    t === "am" ||
    t.startsWith("float") ||
    t === "pmspare" ||
    t === "amspare"
  );
}

function cleanGarage(s: string): string {
  return s
    .replace(/\(\s*spare\s*\)/i, "")
    .replace(/\bspare\b/i, "")
    .replace(/[~.,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

type PlanRow =
  | { kind: "work"; piece: HolidayRunPiece }
  | { kind: "spare"; garage?: string; startMin?: number; guaranteeHrs: number }
  | {
      kind: "floating";
      garage?: string;
      startMin?: number;
      guaranteeHrs: number;
      label: string;
    };

/**
 * One shift's worth of rows: the day's work as the sheet numbers it.
 *
 * The three-digit number at the head of a row is the shift, and one day
 * carries one of them - the rows under it repeat the run instead. So a
 * second shift number is a second day, whether or not the heading between
 * them survived being scanned. That makes the shift number, not the
 * heading, the thing that can be relied on to tell days apart.
 */
interface RowGroup {
  shift: string;
  rows: PlanRow[];
}

interface WeekState {
  weekNum: number;
  start: Date;
  dayOff: Set<WeekdayKey>;
  defaultGroups: RowGroup[];
  dayGroups: Partial<Record<WeekdayKey, RowGroup[]>>;
  /** Which day the rows being read belong to; null means the week default. */
  target: WeekdayKey | null;
  currentBlockNum: string;
  gaps: SheetGap[];
}

function newWeekState(weekNum: number, start: Date): WeekState {
  return {
    weekNum,
    start,
    dayOff: new Set(),
    defaultGroups: [],
    dayGroups: {},
    target: null,
    currentBlockNum: "",
    gaps: [],
  };
}

/**
 * Which day each group of rows belongs to.
 *
 * A day heading places the first group under it. Any further group is the
 * next day's work - the sheet gives one shift to a day - so it moves on to
 * the following working day rather than piling onto the one before it. That
 * is what keeps Tuesday's shift off Tuesday's Thursday when the heading in
 * between came through the scanner as something else entirely.
 *
 * Rows printed before any heading are the week's default. One shift there is
 * the same work Monday to Friday; several are the week's days in order, the
 * headings having been lost altogether.
 */
function assignGroups(w: WeekState): Partial<Record<WeekdayKey, PlanRow[]>> {
  const out: Partial<Record<WeekdayKey, PlanRow[]>> = {};
  const spoken = new Set<WeekdayKey>();

  const free = (from: WeekdayKey | null): WeekdayKey | null => {
    const start = from ? WEEK_ORDER.indexOf(from) + 1 : 0;
    for (let i = start; i < WEEK_ORDER.length; i++) {
      const k = WEEK_ORDER[i];
      if (!WEEKDAY_KEYS.includes(k)) continue;
      if (w.dayOff.has(k) || spoken.has(k) || w.dayGroups[k]) continue;
      return k;
    }
    return null;
  };

  for (const k of WEEK_ORDER) {
    const groups = w.dayGroups[k];
    if (!groups || groups.length === 0) continue;
    out[k] = groups[0].rows;
    spoken.add(k);
    let after: WeekdayKey | null = k;
    for (const extra of groups.slice(1)) {
      const to = free(after);
      if (!to) break;
      out[to] = extra.rows;
      spoken.add(to);
      after = to;
    }
  }

  if (w.defaultGroups.length === 1) {
    for (const k of WEEKDAY_KEYS) {
      if (!w.dayOff.has(k) && !out[k]) out[k] = w.defaultGroups[0].rows;
    }
  } else {
    let after: WeekdayKey | null = null;
    for (const group of w.defaultGroups) {
      const to = free(after);
      if (!to) break;
      out[to] = group.rows;
      spoken.add(to);
      after = to;
    }
  }
  return out;
}

/** A run row either repeats the block/shift number (a fresh block) or
 * omits it (continuing the previous block, identified by a hyphenated run
 * code like "173-02" rather than a bare block number like "480"). */
function parseRunRow(
  line: string,
  currentBlockNum: string
): { row: HolidayRunPiece; blockNum: string } | null {
  const times = extractTimeTokens(line);
  if (times.length < 3) return null;
  const firstToken = line.split(/\s+/)[0];
  const isPureDigits = /^\d+$/.test(firstToken);
  const onIdx = times[0].index;
  const preTokens = line
    .slice(0, onIdx)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let blockNum: string;
  let runCode: string;
  let onLocTokens: string[];
  if (isPureDigits) {
    blockNum = preTokens[0];
    runCode = preTokens[1] || "";
    onLocTokens = preTokens.slice(2);
  } else {
    blockNum = currentBlockNum;
    runCode = preTokens[0] || "";
    onLocTokens = preTokens.slice(1);
  }
  if (!runCode) return null;
  const onLoc = onLocTokens.join(" ");
  const offLoc = line.slice(times[1].end, times[2].index).trim();
  const platMin = hmToMin(times[2].text);
  return {
    blockNum,
    row: {
      run: runCode,
      shiftId: blockNum,
      onLoc,
      onTime: times[0].text,
      offTime: times[1].text,
      offLoc,
      platMin,
    },
  };
}

/**
 * A spare row: which garage, what time to report, how many hours guaranteed.
 *
 * Both ends of the row usually name the same garage, but a P.M. spare says
 * only "P.M. Spare" on the way in and names the garage on the way out, so
 * whichever end actually names a place is the one that counts. A start time
 * of 00:00 is the sheet saying it does not know yet.
 */
function readSpareRow(line: string): {
  garage?: string;
  startMin?: number;
  guaranteeHrs: number;
} | null {
  const times = extractTimeTokens(line);
  if (times.length < 3) return null;
  const onIdx = times[0].index;
  const preTokens = line.slice(0, onIdx).trim().split(/\s+/).filter(Boolean);
  // "M0515 01 MERIVALE SPARE": the code, then the sheet's own numbering of
  // the spare, and only then the place. The numbering is not part of the
  // garage's name.
  let skip = 1;
  if (/^\d{1,2}$/.test(preTokens[skip] ?? "")) skip += 1;
  const onLoc = preTokens.slice(skip).join(" ");
  const offLoc = line.slice(times[1].end, times[2].index).trim();
  const named = [onLoc, offLoc].find((p) => !isGenericPlace(cleanGarage(p)));
  const startMin = hmToMin(times[0].text);
  return {
    garage: named ? canonicalGarage(cleanGarage(named)) : undefined,
    startMin: startMin > 0 ? startMin : undefined,
    guaranteeHrs: hmToMin(times[times.length - 1].text) / 60 || 8,
  };
}

/** Does this row describe standing by rather than driving? */
function looksLikeSpare(line: string): boolean {
  const times = extractTimeTokens(line);
  if (times.length < 3) return false;
  const beforeTimes = line.slice(0, times[0].index);
  const between = line.slice(times[1].end, times[2].index);
  return /spare/i.test(beforeTimes) || /spare/i.test(between);
}

export function parseHolidaySpareSheet(text: string): ParsedSheet {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const plans: HolidayDayPlan[] = [];
  const gaps: SheetGap[] = [];
  let week: WeekState | null = null;
  let pendingWeekNum: number | null = null;
  let rowSeq = 0;

  const DATE_RE = /\d{1,2}\/\d{1,2}\/\d{4}/;

  function flushWeek() {
    if (!week) return;
    const w = week;
    week = null;
    gaps.push(...w.gaps);
    const weekLabel = `Week ${w.weekNum}`;
    const dateOf = (k: WeekdayKey) => addDays(w.start, WEEK_ORDER.indexOf(k));

    const rowsByDay = assignGroups(w);

    let emitted = 0;
    for (const k of WEEK_ORDER) {
      const dateStr = fmtDate(dateOf(k));
      if (w.dayOff.has(k)) {
        plans.push({ dateStr, weekLabel, kind: "dayoff", sourceNote: "Day off" });
        emitted++;
        continue;
      }
      const rows = rowsByDay[k];
      if (!rows || rows.length === 0) continue;

      const pieces = rows
        .filter((r): r is Extract<PlanRow, { kind: "work" }> => r.kind === "work")
        .map((r) => r.piece);
      if (pieces.length > 0) {
        plans.push({
          dateStr,
          weekLabel,
          kind: "work",
          pieces,
          sourceNote: pieces.map((r) => r.run).join(" + "),
        });
        emitted++;
        continue;
      }

      const spare = rows.find(
        (r): r is Extract<PlanRow, { kind: "spare" | "floating" }> =>
          r.kind === "spare" || r.kind === "floating"
      );
      if (!spare) continue;
      plans.push({
        dateStr,
        weekLabel,
        kind: spare.kind === "floating" ? "spare_manual" : "spare_timed",
        guaranteeHrs: spare.guaranteeHrs,
        garage: spare.garage,
        startMin: spare.startMin,
        floating: spare.kind === "floating" || undefined,
        sourceNote:
          spare.kind === "floating"
            ? spare.label
            : `Spare${spare.garage ? ` at ${spare.garage}` : ""}`,
      });
      emitted++;
    }

    if (emitted === 0) {
      gaps.push({
        weekLabel,
        line: `${weekLabel} (${fmtDate(w.start)})`,
        why: "nothing was printed under this week",
      });
    }
  }

  function groupsForTarget(w: WeekState): RowGroup[] {
    if (w.target === null) return w.defaultGroups;
    return (w.dayGroups[w.target] ??= []);
  }

  /**
   * Puts a row where it belongs, opening a new group when the shift changes.
   *
   * A row that names a shift the current group does not is the start of the
   * next day's work, even when the heading that should have said so did not
   * survive being scanned.
   */
  function addRow(w: WeekState, row: PlanRow, shift: string) {
    const groups = groupsForTarget(w);
    const last = groups[groups.length - 1];
    if (last && last.shift === shift) last.rows.push(row);
    else groups.push({ shift, rows: [row] });
  }

  for (const line of lines) {
    const weekMatch = line.match(/^WEEK\s+(\d+)\b(.*)$/i);
    if (weekMatch) {
      const num = parseInt(weekMatch[1]);
      // Only the start date is needed, and only that one can be relied on:
      // OCR mangles the end of the heading often enough that insisting on a
      // whole range loses the week ("WEEK 45 11/8/2026 TO Ta boos").
      const dateMatch = weekMatch[2].match(DATE_RE);
      const start = dateMatch ? parseMDY(dateMatch[0]) : null;
      if (start) {
        flushWeek();
        week = newWeekState(num, start);
        pendingWeekNum = null;
      } else if (week && week.weekNum === num) {
        // A bare repeat of the heading we are already inside.
      } else {
        flushWeek();
        pendingWeekNum = num;
      }
      continue;
    }
    if (pendingWeekNum != null) {
      const dateMatch = line.match(DATE_RE);
      const start = dateMatch ? parseMDY(dateMatch[0]) : null;
      if (start) {
        week = newWeekState(pendingWeekNum, start);
        pendingWeekNum = null;
        continue;
      }
    }
    if (!week) {
      if (
        !/EMPLOYEE BOOKING SHEET/i.test(line) &&
        !/^\d{6}\s+[A-Za-z]/.test(line) &&
        !/^\d{8}\s*-/.test(line) &&
        extractTimeTokens(line).length > 0
      ) {
        gaps.push({ weekLabel: "", line, why: "it came before any week heading" });
      }
      continue;
    }

    let dayOffFound = false;
    const dayOffRe = /Day\s*Off\s+([A-Za-z]+)\s*-\s*\d+/gi;
    let dm: RegExpExecArray | null;
    while ((dm = dayOffRe.exec(line))) {
      const k = weekdayNear(dm[1]);
      if (k) {
        week.dayOff.add(k);
        dayOffFound = true;
      }
    }
    if (dayOffFound) continue;

    const times = extractTimeTokens(line);
    if (times.length === 0) {
      // A day heading: "Monday - 1", and whatever OCR made of it. The
      // weekday need not be the first thing on the line - a stray mark
      // scans as a word - so the whole line is searched, as long as it is
      // short enough to be a heading and not a row.
      const headMatch =
        line.length <= 40
          ? line.match(/([A-Za-z]{4,12})\s*[-–—]\s*(\d+)/)
          : null;
      const k = headMatch ? weekdayNear(headMatch[1]) : null;
      if (k) {
        week.target = k;
        week.currentBlockNum = "";
      }
      continue;
    }

    const first = line.split(/\s+/)[0];
    const floatMatch = /^(FSPEE|FSPE|FSP)\b/i.test(first);
    if (floatMatch || looksLikeSpare(line)) {
      const read = readSpareRow(line);
      if (!read) {
        week.gaps.push({
          weekLabel: `Week ${week.weekNum}`,
          line,
          why: "it looks like a spare but its times could not be read",
        });
        continue;
      }
      // A spare has no shift number, so each row stands on its own.
      //
      // A floating spare keeps only its guarantee. What it prints for a
      // garage and a report time is the booking it floats against, not
      // where the operator was actually sent, and filling those in would
      // put a time on the day that nobody told them to report at.
      addRow(
        week,
        floatMatch
          ? { kind: "floating", guaranteeHrs: read.guaranteeHrs, label: line }
          : { kind: "spare", ...read },
        `spare:${rowSeq++}`
      );
      continue;
    }

    const parsed = parseRunRow(line, week.currentBlockNum);
    if (!parsed) {
      week.gaps.push({
        weekLabel: `Week ${week.weekNum}`,
        line,
        why: "it has times on it but is not a run, a spare or a day off",
      });
      continue;
    }
    week.currentBlockNum = parsed.blockNum;
    addRow(week, { kind: "work", piece: parsed.row }, parsed.blockNum);
  }
  flushWeek();

  plans.sort((a, b) => (a.dateStr < b.dateStr ? -1 : a.dateStr > b.dateStr ? 1 : 0));
  return { plans, gaps };
}
