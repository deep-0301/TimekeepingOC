import { fmtDate, getWeekDates } from "./dateUtils";
import type {
  DayComputed,
  DayComputedWithOt,
  EntriesMap,
  PaySettings,
  WeekComputed,
} from "./types";

const EMPTY_DAY: DayComputed = {
  platMin: 0,
  payMin: 0,
  matched: false,
  fromSheet: false,
  nonPlatform: 0,
  callup: 0,
  booking: 0,
  isSunday: false,
  isStat: false,
  pieces: [],
};

export function computeDay(
  entries: EntriesMap,
  dateStr: string
): DayComputed {
  const e = entries[dateStr];
  if (!e) return EMPTY_DAY;

  if (e.fromSheet) {
    return {
      platMin: e.sheetPlat || 0,
      payMin: e.sheetPay || 0,
      matched: true,
      fromSheet: true,
      nonPlatform: e.nonPlatform || 0,
      callup: e.callup || 0,
      booking: e.booking || 0,
      isSunday: !!e.isSunday,
      isStat: !!e.isStat,
      pieces: e.pieces || [],
    };
  }

  // group pieces by shiftId - if the set of runs added for a shift equals
  // that shift's full run list, use the shift's authoritative (board) total
  const byShift: Record<string, typeof e.pieces> = {};
  e.pieces.forEach((p) => {
    (byShift[p.shiftId] = byShift[p.shiftId] || []).push(p);
  });

  let platMin = 0;
  let payMin = 0;
  let matched = true;
  Object.keys(byShift).forEach((sid) => {
    const grp = byShift[sid];
    const allRuns = grp[0].allRuns;
    const addedRuns = grp
      .map((p) => p.run)
      .sort()
      .join(",");
    const fullRuns = [...allRuns].sort().join(",");
    if (addedRuns === fullRuns) {
      platMin += grp[0].shiftPlat;
      payMin += grp[0].shiftPay;
    } else {
      matched = false;
      const sumPlat = grp.reduce((a, p) => a + p.platMin, 0);
      platMin += sumPlat;
      payMin += sumPlat; // no board-confirmed break add-on for partial match
    }
  });

  return {
    platMin,
    payMin,
    matched,
    fromSheet: false,
    nonPlatform: e.nonPlatform || 0,
    callup: e.callup || 0,
    booking: e.booking || 0,
    isSunday: !!e.isSunday,
    isStat: !!e.isStat,
    pieces: e.pieces,
  };
}

export function computeWeek(
  entries: EntriesMap,
  days: Date[],
  settings: PaySettings
): WeekComputed {
  let sumPlat = 0;
  let sumPay = 0;
  let sumNonPlat = 0;
  let sumCallup = 0;
  let sumBooking = 0;
  let statDays = 0;
  let sundayHrs = 0;
  let otMin = 0;

  const perDay: DayComputedWithOt[] = days.map((d) => {
    const dateStr = fmtDate(d);
    const dc = computeDay(entries, dateStr);
    const dailyOtThreshMin = settings.otThreshold * 60;
    const dayOt = Math.max(0, dc.payMin - dailyOtThreshMin);
    otMin += dayOt;
    sumPlat += dc.platMin;
    sumPay += dc.payMin;
    sumNonPlat += dc.nonPlatform;
    sumCallup += dc.callup;
    sumBooking += dc.booking;
    if (dc.isStat) statDays++;
    if (dc.isSunday) sundayHrs += dc.payMin / 60;
    return { dateStr, ...dc, dayOt };
  });

  const regMin = Math.max(0, sumPay - otMin);
  const regularHrs = regMin / 60;
  const otHrs = otMin / 60;
  const regularPay = regularHrs * settings.baseRate;
  const otPay = otHrs * settings.baseRate * settings.otMultiplier;
  const nonPlatPay = (sumNonPlat / 60) * settings.baseRate;
  const callupPay = (sumCallup / 60) * settings.baseRate;
  const bookingPay = (sumBooking / 60) * settings.baseRate;
  const sundayPay =
    sundayHrs * settings.baseRate * (settings.sundayMultiplier - 1);
  const statPay = statDays * settings.statHolidayPay;
  const grossPay =
    regularPay + otPay + nonPlatPay + callupPay + bookingPay + sundayPay + statPay;

  return {
    perDay,
    sumPlat,
    sumPay,
    regularHrs,
    otHrs,
    regularPay,
    otPay,
    nonPlatPay,
    callupPay,
    bookingPay,
    sundayPay,
    statPay,
    grossPay,
    sumNonPlat,
    sumCallup,
    sumBooking,
    statDays,
    sundayHrs,
  };
}

export function getWeekDatesFor(refDate: Date, settings: PaySettings): Date[] {
  return getWeekDates(refDate, settings.weekStart);
}
