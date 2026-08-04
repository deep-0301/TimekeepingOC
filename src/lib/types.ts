export interface PaySettings {
  baseRate: number;
  otMultiplier: number;
  /** Daily platform/standby-hours OT threshold - applies to spare/standby
   * days only, each day judged on its own. */
  otThreshold: number;
  /** Biweekly platform-hours OT threshold for regular booked work - applies
   * to the pay period's cumulative total, not any single day. */
  periodOtThreshold: number;
  sundayMultiplier: number;
  statHolidayPay: number;
  weekStart: "sunday" | "monday";
  /** Any known pay-period-start date (yyyy-mm-dd); biweekly periods are
   * computed as 14-day blocks aligned to this date. Updated automatically
   * when a booking sheet's season start date is parsed. */
  payPeriodAnchor: string;
  /**
   * Which kind of booking this operator holds, chosen once on first visit
   * (Profile lets them change it later). Drives how many booking-sheet
   * import slots are shown and what they're labelled:
   * - "daily": one sheet, the operator's own daily assignment.
   * - "general": covers a daily operator's days off - two sheets (a
   *   Mon-Fri sheet, and a Sat/Sun + stat holiday sheet).
   * - "holiday": holiday spare - two sheets (regular holiday work each
   *   week, and holiday stat work).
   * null until the operator picks one.
   */
  bookingType: "daily" | "general" | "holiday" | null;
}

export const DEFAULT_SETTINGS: PaySettings = {
  baseRate: 32.224,
  otMultiplier: 1.5,
  otThreshold: 8,
  periodOtThreshold: 80,
  sundayMultiplier: 1.25,
  statHolidayPay: 257.79,
  weekStart: "sunday",
  payPeriodAnchor: "2026-06-28",
  bookingType: null,
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
  /** Board index this piece's shift was matched to, when it could be. */
  shiftIndex?: number | null;
  allRuns: string[];
}

/**
 * A spare/standby assignment. By default it's paid a flat number of
 * standby hours (`guaranteeHrs`, from the booking sheet's guarantee
 * figure). If the operator records what actually happened via `mode`:
 * - "standby": never dispatched - paid for the time from `startMin` to
 *   `standbyEndMin`, capped at 8 hours.
 * - "work": dispatched to `runNumber` - paid for the standby time from
 *   `startMin` to the run's actual start, plus the run's own worked time
 *   (using `workOnTimeOverride`/`workOffTimeOverride` in place of the
 *   board's scheduled times when the operator's actual times differed,
 *   e.g. a shortened spread), plus a flat 30-minute callup.
 * A 30-minute callup also applies to any spare (dispatched or not) whose
 * report time is exactly one of the half-hourly callup times.
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
  /** Recorded outcome, once known - otherwise paid the flat guaranteeHrs. */
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
  /** sheetPlat/sheetPay came from the board the runs matched, not from the
   * figures printed on the sheet. */
  fromBoard?: boolean;
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
