export interface PaySettings {
  baseRate: number;
  otMultiplier: number;
  otThreshold: number;
  sundayMultiplier: number;
  statHolidayPay: number;
  weekStart: "sunday" | "monday";
  /** Any known pay-period-start date (yyyy-mm-dd); biweekly periods are
   * computed as 14-day blocks aligned to this date. Updated automatically
   * when a booking sheet's season start date is parsed. */
  payPeriodAnchor: string;
}

export const DEFAULT_SETTINGS: PaySettings = {
  baseRate: 32.224,
  otMultiplier: 1.5,
  otThreshold: 8,
  sundayMultiplier: 1.25,
  statHolidayPay: 257.79,
  weekStart: "sunday",
  payPeriodAnchor: "2026-06-28",
};

/** A single board schedule row: [run, onTime, offTime, onLoc, offLoc, platMin] */
export type BoardRun = [string, string, string, string, string, number];

/** A shift group: [shiftId, totalPlatMin, totalPayMin, runs] */
export type BoardShift = [string, number, number, BoardRun[]];

export interface EntryPiece {
  run: string;
  shiftId: string;
  shiftPlat: number;
  shiftPay: number;
  onTime: string;
  offTime: string;
  onLoc: string;
  offLoc: string;
  platMin: number;
  allRuns: string[];
}

/**
 * A spare/standby assignment. Morning spares (reporting before 9:30) are
 * paid a flat number of standby hours (`guaranteeHrs`). Spares reporting at
 * or after 9:30 must record what actually happened via `afternoonMode`:
 * - "standby": never dispatched - paid for the time from `startMin` to
 *   `standbyEndMin`, capped at 8 hours.
 * - "work": dispatched to `runNumber` - paid for the standby time from
 *   `startMin` to the run's actual start, plus the run's own worked time
 *   (using `workOnTimeOverride`/`workOffTimeOverride` in place of the
 *   board's scheduled times when the operator's actual times differed,
 *   e.g. a shortened spread), plus a flat 30-minute callup.
 * A 30-minute callup also applies to any spare (AM or PM, dispatched or
 * not) whose report time is exactly one of the half-hourly callup times.
 */
export interface SpareInfo {
  guaranteeHrs: number;
  runNumber: string | null;
  /** Board index (into BOARD_DATA) of the shift the run was dispatched to,
   * when a run number belongs to more than one shift in the loaded board. */
  shiftIndex?: number | null;
  /** Report time on standby, in minutes since midnight. */
  startMin?: number;
  /** Garage the spare reported to for standby. */
  garage?: string;
  /** Chosen outcome for a spare reporting at/after 9:30. */
  afternoonMode?: "work" | "standby";
  /** Clock time standby ended, for the "standby" (not dispatched) outcome. */
  standbyEndMin?: number;
  /** Manual override of the dispatched run's actual start/finish time, in
   * minutes since midnight, when it differs from the board's scheduled
   * time (e.g. the operator's work was cut short on the spread). */
  workOnTimeOverride?: number;
  workOffTimeOverride?: number;
}

export interface DayEntry {
  pieces: EntryPiece[];
  nonPlatform: number;
  callup: number;
  booking: number;
  /** Arrive-Late/Come-time, in minutes — the raw late-arrival duration
   * entered by the user as a time (H:MM). Entering this auto-fills
   * revisedTimeMin as avlcMin + 5. */
  avlcMin?: number;
  /** Revised report/relief time, in minutes — this is what actually counts
   * as platform hours. Auto-derived from avlcMin (+5 min) but can also be
   * entered directly, in which case avlcMin is left untouched. */
  revisedTimeMin?: number;
  /** Why the operator arrived late, when avlcMin/revisedTimeMin are set. */
  lateReason?: "traffic_weather" | "extended";
  isStat: boolean;
  dayOff?: boolean;
  /** Category of a day off, e.g. for payroll reporting. */
  dayOffType?: "sick" | "legislative";
  fromSheet?: boolean;
  sheetPlat?: number;
  sheetPay?: number;
  spare?: SpareInfo | null;
}

export type EntriesMap = Record<string, DayEntry>;

export type DayFieldName =
  | "nonPlatform"
  | "callup"
  | "booking"
  | "avlcMin"
  | "revisedTimeMin"
  | "isStat"
  | "dayOff"
  | "lateReason"
  | "dayOffType";

export type DayFieldValue = number | boolean | string;

export interface DayComputed {
  platMin: number;
  payMin: number;
  matched: boolean;
  fromSheet: boolean;
  nonPlatform: number;
  callup: number;
  booking: number;
  /** Derived from the calendar date itself, not stored per-entry. */
  isSunday: boolean;
  isStat: boolean;
  dayOff: boolean;
  pieces: EntryPiece[];
  spare: SpareInfo | null;
}

export interface DayComputedWithOt extends DayComputed {
  dateStr: string;
  dayOt: number;
}

export interface WeekComputed {
  perDay: DayComputedWithOt[];
  sumPlat: number;
  sumPay: number;
  regularHrs: number;
  otHrs: number;
  regularPay: number;
  otPay: number;
  nonPlatPay: number;
  callupPay: number;
  bookingPay: number;
  sundayPay: number;
  statPay: number;
  grossPay: number;
  sumNonPlat: number;
  sumCallup: number;
  sumBooking: number;
  statDays: number;
  sundayHrs: number;
  clcBreakHrs: number;
  clcBreakPay: number;
  totalHrs: number;
}

export function newEmptyDayEntry(): DayEntry {
  return {
    pieces: [],
    nonPlatform: 0,
    callup: 0,
    booking: 0,
    isStat: false,
    dayOff: false,
  };
}
