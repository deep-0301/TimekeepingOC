export interface PaySettings {
  baseRate: number;
  otMultiplier: number;
  otThreshold: number;
  sundayMultiplier: number;
  statHolidayPay: number;
  weekStart: "sunday" | "monday";
}

export const DEFAULT_SETTINGS: PaySettings = {
  baseRate: 32.224,
  otMultiplier: 1.5,
  otThreshold: 8,
  sundayMultiplier: 1.25,
  statHolidayPay: 257.79,
  weekStart: "sunday",
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

export interface DayEntry {
  pieces: EntryPiece[];
  nonPlatform: number;
  callup: number;
  booking: number;
  isSunday: boolean;
  isStat: boolean;
  fromSheet?: boolean;
  sheetPlat?: number;
  sheetPay?: number;
}

export type EntriesMap = Record<string, DayEntry>;

export interface DayComputed {
  platMin: number;
  payMin: number;
  matched: boolean;
  fromSheet: boolean;
  nonPlatform: number;
  callup: number;
  booking: number;
  isSunday: boolean;
  isStat: boolean;
  pieces: EntryPiece[];
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
}

export function newEmptyDayEntry(): DayEntry {
  return {
    pieces: [],
    nonPlatform: 0,
    callup: 0,
    booking: 0,
    isSunday: false,
    isStat: false,
  };
}
