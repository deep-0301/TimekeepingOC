import { extractTimeTokens, hmToMin } from "./bookingSheetParser";
import { fmtDate } from "./dateUtils";

/**
 * Parses the "holiday spare" weekly booking sheet format - a completely
 * different layout from the daily/general sheets (see bookingSheetParser.ts):
 * one document covers the whole season, organized as "WEEK N ... TO ..."
 * blocks, each block being one of:
 * - A floating spare week (FSP/FSPE/FSPEE): no real per-day times printed -
 *   the operator reports and fills in Garage/Reports manually each day.
 * - A special one-off week (marked "OHSP..."): real per-date rows with an
 *   explicit garage and report time (e.g. a festival standby week).
 * - A regular run week: the same run(s) worked every weekday, optionally
 *   with its own separate run(s) for Sunday and/or Saturday, and specific
 *   weekdays called out as "Day Off <Weekday> - N".
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
  sourceNote: string;
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

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function parseMDY(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
}

interface OhspDay {
  date: Date;
  isOff: boolean;
  garage?: string;
  startMin?: number;
  guaranteeHrs?: number;
}

interface WeekState {
  weekNum: number;
  start: Date;
  mode: "unknown" | "fsp" | "ohsp" | "runs";
  fspGuaranteeHrs: number | null;
  fspLabel: string;
  dayOffWeekdays: Set<string>;
  weekdayRows: HolidayRunPiece[];
  sundayRows: HolidayRunPiece[];
  saturdayRows: HolidayRunPiece[];
  ohspDays: OhspDay[];
  currentTarget: "weekday" | "sunday" | "saturday";
  currentBlockNum: string;
}

function newWeekState(weekNum: number, start: Date): WeekState {
  return {
    weekNum,
    start,
    mode: "unknown",
    fspGuaranteeHrs: null,
    fspLabel: "",
    dayOffWeekdays: new Set(),
    weekdayRows: [],
    sundayRows: [],
    saturdayRows: [],
    ohspDays: [],
    currentTarget: "weekday",
    currentBlockNum: "",
  };
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

export function parseHolidaySpareSheet(text: string): HolidayDayPlan[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const plans: HolidayDayPlan[] = [];
  let week: WeekState | null = null;
  let pendingWeekNum: number | null = null;

  const WEEK_RANGE_RE =
    /(\d{1,2}\/\d{1,2}\/\d{4})\s*TO\s*(\d{1,2}\/\d{1,2}\/\d{4})/i;

  function flushWeek() {
    if (!week) return;
    const w = week;
    week = null;
    const dates: Record<WeekdayKey, Date> = {
      sun: w.start,
      mon: addDays(w.start, 1),
      tue: addDays(w.start, 2),
      wed: addDays(w.start, 3),
      thu: addDays(w.start, 4),
      fri: addDays(w.start, 5),
      sat: addDays(w.start, 6),
    };
    const weekLabel = `Week ${w.weekNum}`;
    const isOff = (k: WeekdayKey) => w.dayOffWeekdays.has(WEEKDAY_FULL_NAMES[k]);

    if (w.mode === "fsp") {
      const ghrs = w.fspGuaranteeHrs ?? 8;
      (["mon", "tue", "wed", "thu", "fri"] as const).forEach((k) => {
        plans.push(
          isOff(k)
            ? { dateStr: fmtDate(dates[k]), weekLabel, kind: "dayoff", sourceNote: "Day off" }
            : {
                dateStr: fmtDate(dates[k]),
                weekLabel,
                kind: "spare_manual",
                guaranteeHrs: ghrs,
                sourceNote: w.fspLabel,
              }
        );
      });
      if (isOff("sun")) {
        plans.push({ dateStr: fmtDate(dates.sun), weekLabel, kind: "dayoff", sourceNote: "Day off" });
      }
      if (isOff("sat")) {
        plans.push({ dateStr: fmtDate(dates.sat), weekLabel, kind: "dayoff", sourceNote: "Day off" });
      }
    } else if (w.mode === "ohsp") {
      w.ohspDays.forEach((d) => {
        plans.push(
          d.isOff
            ? { dateStr: fmtDate(d.date), weekLabel, kind: "dayoff", sourceNote: "Day off" }
            : {
                dateStr: fmtDate(d.date),
                weekLabel,
                kind: "spare_timed",
                guaranteeHrs: d.guaranteeHrs ?? 8,
                garage: d.garage,
                startMin: d.startMin,
                sourceNote: "Special event spare",
              }
        );
      });
    } else {
      (["mon", "tue", "wed", "thu", "fri"] as const).forEach((k) => {
        if (isOff(k)) {
          plans.push({ dateStr: fmtDate(dates[k]), weekLabel, kind: "dayoff", sourceNote: "Day off" });
        } else if (w.weekdayRows.length > 0) {
          plans.push({
            dateStr: fmtDate(dates[k]),
            weekLabel,
            kind: "work",
            pieces: w.weekdayRows,
            sourceNote: w.weekdayRows.map((r) => r.run).join(" + "),
          });
        }
      });
      if (isOff("sun")) {
        plans.push({ dateStr: fmtDate(dates.sun), weekLabel, kind: "dayoff", sourceNote: "Day off" });
      } else if (w.sundayRows.length > 0) {
        plans.push({
          dateStr: fmtDate(dates.sun),
          weekLabel,
          kind: "work",
          pieces: w.sundayRows,
          sourceNote: w.sundayRows.map((r) => r.run).join(" + "),
        });
      }
      if (isOff("sat")) {
        plans.push({ dateStr: fmtDate(dates.sat), weekLabel, kind: "dayoff", sourceNote: "Day off" });
      } else if (w.saturdayRows.length > 0) {
        plans.push({
          dateStr: fmtDate(dates.sat),
          weekLabel,
          kind: "work",
          pieces: w.saturdayRows,
          sourceNote: w.saturdayRows.map((r) => r.run).join(" + "),
        });
      }
    }
  }

  for (const line of lines) {
    const weekMatch = line.match(/^WEEK\s+(\d+)\b(.*)$/i);
    if (weekMatch) {
      flushWeek();
      const rangeMatch = weekMatch[2].match(WEEK_RANGE_RE);
      if (rangeMatch) {
        const start = parseMDY(rangeMatch[1]);
        if (start) week = newWeekState(parseInt(weekMatch[1]), start);
        pendingWeekNum = null;
      } else {
        pendingWeekNum = parseInt(weekMatch[1]);
      }
      continue;
    }
    if (pendingWeekNum != null) {
      const rangeMatch = line.match(WEEK_RANGE_RE);
      if (rangeMatch) {
        const start = parseMDY(rangeMatch[1]);
        if (start) week = newWeekState(pendingWeekNum, start);
        pendingWeekNum = null;
        continue;
      }
    }
    if (!week) continue;

    let dayOffFound = false;
    const dayOffRe =
      /Day Off (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*-\s*\d+/gi;
    let dm: RegExpExecArray | null;
    while ((dm = dayOffRe.exec(line))) {
      week.dayOffWeekdays.add(dm[1].toLowerCase());
      dayOffFound = true;
    }
    if (dayOffFound) continue;

    const bareWeekendMatch = line.match(/^(Sunday|Saturday)\s*-\s*(\d+)$/i);
    if (bareWeekendMatch) {
      week.currentTarget = /sunday/i.test(bareWeekendMatch[1]) ? "sunday" : "saturday";
      week.currentBlockNum = "";
      continue;
    }

    const fspMatch = line.match(/^(FSPEE|FSPE|FSP)\b/i);
    if (fspMatch) {
      week.mode = "fsp";
      week.fspLabel = line;
      const times = extractTimeTokens(line);
      if (times.length > 0) {
        week.fspGuaranteeHrs = hmToMin(times[times.length - 1].text) / 60;
      }
      continue;
    }

    if (/^OHSP/i.test(line)) {
      week.mode = "ohsp";
      continue;
    }

    if (week.mode === "ohsp") {
      const dateLineMatch = line.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s*(.*)$/);
      if (dateLineMatch) {
        const d = parseMDY(dateLineMatch[1]);
        if (!d) continue;
        const rest = dateLineMatch[2].trim();
        if (/^OFF$/i.test(rest)) {
          week.ohspDays.push({ date: d, isOff: true });
          continue;
        }
        const times = extractTimeTokens(rest);
        if (times.length < 3) continue;
        const onIdx = times[0].index;
        const preTokens = rest.slice(0, onIdx).trim().split(/\s+/).filter(Boolean);
        const onLoc = preTokens.slice(1).join(" ");
        const offLoc = rest.slice(times[1].end, times[2].index).trim();
        const garage = onLoc.replace(/\(\s*spare\s*\)/i, "").trim() || offLoc;
        week.ohspDays.push({
          date: d,
          isOff: false,
          garage,
          startMin: hmToMin(times[0].text),
          guaranteeHrs: hmToMin(times[times.length - 1].text) / 60,
        });
      }
      continue;
    }

    if (week.mode === "unknown") week.mode = "runs";
    if (week.mode !== "runs") continue;
    const parsed = parseRunRow(line, week.currentBlockNum);
    if (!parsed) continue;
    week.currentBlockNum = parsed.blockNum;
    if (week.currentTarget === "sunday") week.sundayRows.push(parsed.row);
    else if (week.currentTarget === "saturday") week.saturdayRows.push(parsed.row);
    else week.weekdayRows.push(parsed.row);
  }
  flushWeek();

  return plans;
}
