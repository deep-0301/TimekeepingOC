/**
 * Hours of service, per Ontario's Hours of Service regulation (O. Reg.
 * 555/06) as summarised in the MTO Truck Handbook:
 * https://www.ontario.ca/document/official-ministry-transportation-mto-truck-handbook/hours-service
 *
 * Duty time here is worked out from real clock times rather than from the
 * pay figures. Pay and duty are not the same thing - a guarantee can pay a
 * spare for eight hours they did not spend on duty, and that must not count
 * against a driving limit.
 */
import { BOARD_DATA } from "./board";
import { parseDateStr, toMin } from "./dateUtils";
import type { DayEntry, EntriesMap } from "./types";

const H = 60;

export const HOS_LIMITS = {
  /** Most driving time allowed in a day. */
  dailyDriving: 13 * H,
  /** Most on-duty time allowed in a day. */
  dailyOnDuty: 14 * H,
  /** No driving once this much time has elapsed since coming on duty. */
  elapsedWindow: 16 * H,
  /** Least off-duty time required in a day. */
  dailyOffDuty: 10 * H,
  /** Of that off-duty time, this much must be consecutive. */
  consecutiveOffDuty: 8 * H,
  /** Cycle 1: on-duty time in any 7 consecutive days. */
  cycle1: 70 * H,
  /** Cycle 2: on-duty time in any 14 consecutive days. */
  cycle2: 120 * H,
  /** Off-duty time that resets each cycle. */
  cycle1Reset: 36 * H,
  cycle2Reset: 72 * H,
} as const;

export type HosCycle = "cycle1" | "cycle2";

export interface HosDay {
  dateStr: string;
  /** Time at the wheel. */
  drivingMin: number;
  /** On duty but not driving - standby, callup, booking, other duties. */
  otherOnDutyMin: number;
  onDutyMin: number;
  offDutyMin: number;
  /** Coming on duty to going off duty, which the 16-hour rule runs on. */
  elapsedMin: number;
  firstOnMin: number | null;
  lastOffMin: number | null;
  dayOff: boolean;
  /** True when the day's duty time had to be inferred rather than read off
   * recorded clock times - a spare paid its guarantee with no outcome logged. */
  estimated: boolean;
  label: string;
}

function spanFrom(onTime: string, offTime: string): number {
  const a = toMin(onTime);
  const b = toMin(offTime);
  return b >= a ? b - a : b + 24 * H - a;
}

/** Duty time for one day, from whatever the operator has recorded. */
export function hosForDay(dateStr: string, e: DayEntry | undefined): HosDay {
  const base: HosDay = {
    dateStr,
    drivingMin: 0,
    otherOnDutyMin: 0,
    onDutyMin: 0,
    offDutyMin: 24 * H,
    elapsedMin: 0,
    firstOnMin: null,
    lastOffMin: null,
    dayOff: false,
    estimated: false,
    label: "—",
  };
  if (!e) return base;

  const extras =
    (e.nonPlatform || 0) * H + (e.callup || 0) * H + (e.booking || 0) * H;

  let driving = 0;
  let other = extras;
  let estimated = false;
  let first: number | null = null;
  let last: number | null = null;
  let label = "—";

  const note = (t: number) => {
    if (first === null || t < first) first = t;
  };
  const noteEnd = (t: number) => {
    if (last === null || t > last) last = t;
  };

  if (e.spare) {
    const sp = e.spare;
    const start = sp.startMin ?? null;
    if (start != null) note(start);

    if (sp.afternoonMode === "work" && sp.runNumber) {
      const shift = sp.shiftIndex != null ? BOARD_DATA[sp.shiftIndex] : undefined;
      const boardOn = shift ? toMin(shift[3][0][1]) : null;
      const boardOff = shift
        ? toMin(shift[3][shift[3].length - 1][2])
        : null;
      const on = sp.workOnTimeOverride ?? boardOn;
      const off = sp.workOffTimeOverride ?? boardOff;
      if (on != null && off != null) {
        driving += off >= on ? off - on : off + 24 * H - on;
        note(on);
        noteEnd(off);
        // Waiting at the garage from report time until the run started.
        if (start != null) other += Math.max(0, on - start);
      }
      label = "Spare — dispatched";
    } else if (sp.afternoonMode === "standby" || sp.standbyEndMin != null) {
      if (start != null && sp.standbyEndMin != null) {
        other += Math.max(0, sp.standbyEndMin - start);
        noteEnd(sp.standbyEndMin);
      } else {
        other += (sp.guaranteeHrs || 8) * H;
        estimated = true;
      }
      label = "Spare — standby";
    } else {
      // Nothing logged yet, so the guarantee is the only figure available.
      other += (sp.guaranteeHrs || 8) * H;
      estimated = true;
      if (start != null) noteEnd(start + (sp.guaranteeHrs || 8) * H);
      label = "Spare — not logged";
    }
  }

  for (const p of e.pieces) {
    driving += spanFrom(p.onTime, p.offTime);
    note(toMin(p.onTime));
    const off = toMin(p.offTime);
    noteEnd(off < toMin(p.onTime) ? off + 24 * H : off);
  }

  if (e.pieces.length > 0 && !e.spare) label = "Driving";
  if (e.dayOff) label = e.pieces.length > 0 ? "Day off — worked OT" : "Day off";

  // Revised time past the booked finish is time actually still on duty.
  if (e.revisedTimeMin != null && last != null && e.revisedTimeMin > last) {
    other += e.revisedTimeMin - last;
    noteEnd(e.revisedTimeMin);
  }

  const onDuty = driving + other;
  const elapsed =
    first != null && last != null ? Math.max(0, last - first) : onDuty;

  return {
    dateStr,
    drivingMin: driving,
    otherOnDutyMin: other,
    onDutyMin: onDuty,
    offDutyMin: Math.max(0, 24 * H - onDuty),
    elapsedMin: elapsed,
    firstOnMin: first,
    lastOffMin: last,
    dayOff: !!e.dayOff,
    estimated,
    label,
  };
}

export interface HosDayRow extends HosDay {
  /** On-duty time over this day and the six before it. */
  rolling7Min: number;
  /** On-duty time over this day and the thirteen before it. */
  rolling14Min: number;
  breaches: string[];
}

function shiftDate(dateStr: string, days: number): string {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Builds the rows for a run of dates. Rolling totals reach back past the
 * first date, so a period that opens mid-cycle still counts what came
 * before it.
 */
export function hosRows(
  dateStrs: string[],
  entries: EntriesMap,
  cycle: HosCycle
): HosDayRow[] {
  const cache = new Map<string, HosDay>();
  const dayAt = (ds: string) => {
    let v = cache.get(ds);
    if (!v) {
      v = hosForDay(ds, entries[ds]);
      cache.set(ds, v);
    }
    return v;
  };

  const rollingBack = (ds: string, days: number) => {
    let sum = 0;
    for (let i = 0; i < days; i++) sum += dayAt(shiftDate(ds, -i)).onDutyMin;
    return sum;
  };

  return dateStrs.map((ds) => {
    const d = dayAt(ds);
    const rolling7Min = rollingBack(ds, 7);
    const rolling14Min = rollingBack(ds, 14);
    const breaches: string[] = [];

    if (d.drivingMin > HOS_LIMITS.dailyDriving) breaches.push("13 h driving");
    if (d.onDutyMin > HOS_LIMITS.dailyOnDuty) breaches.push("14 h on duty");
    if (d.elapsedMin > HOS_LIMITS.elapsedWindow) breaches.push("16 h elapsed");
    if (d.onDutyMin > 0 && d.offDutyMin < HOS_LIMITS.dailyOffDuty)
      breaches.push("10 h off duty");
    if (cycle === "cycle1" && rolling7Min > HOS_LIMITS.cycle1)
      breaches.push("70 h / 7 days");
    if (cycle === "cycle2" && rolling14Min > HOS_LIMITS.cycle2)
      breaches.push("120 h / 14 days");

    return { ...d, rolling7Min, rolling14Min, breaches };
  });
}

export interface HosTotals {
  drivingMin: number;
  otherOnDutyMin: number;
  onDutyMin: number;
  daysWorked: number;
  breachCount: number;
  estimatedDays: number;
}

export function hosTotals(rows: HosDayRow[]): HosTotals {
  return rows.reduce<HosTotals>(
    (acc, r) => ({
      drivingMin: acc.drivingMin + r.drivingMin,
      otherOnDutyMin: acc.otherOnDutyMin + r.otherOnDutyMin,
      onDutyMin: acc.onDutyMin + r.onDutyMin,
      daysWorked: acc.daysWorked + (r.onDutyMin > 0 ? 1 : 0),
      breachCount: acc.breachCount + (r.breaches.length > 0 ? 1 : 0),
      estimatedDays: acc.estimatedDays + (r.estimated ? 1 : 0),
    }),
    {
      drivingMin: 0,
      otherOnDutyMin: 0,
      onDutyMin: 0,
      daysWorked: 0,
      breachCount: 0,
      estimatedDays: 0,
    }
  );
}
