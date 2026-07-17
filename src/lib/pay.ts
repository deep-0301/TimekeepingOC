import { runIndex } from "./board";
import { fmtDate, getPayPeriodDates, getWeekDates } from "./dateUtils";
import type {
  DayComputed,
  DayComputedWithOt,
  EntriesMap,
  EntryPiece,
  PaySettings,
  WeekComputed,
} from "./types";

const SPARE_CALLUP_HRS = 0.5;

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
  dayOff: false,
  pieces: [],
  spare: null,
};

export function computeDay(
  entries: EntriesMap,
  dateStr: string
): DayComputed {
  const e = entries[dateStr];
  if (!e) return EMPTY_DAY;

  if (e.dayOff) {
    return {
      platMin: 0,
      payMin: 0,
      matched: true,
      fromSheet: false,
      nonPlatform: 0,
      callup: 0,
      booking: 0,
      isSunday: !!e.isSunday,
      isStat: !!e.isStat,
      dayOff: true,
      pieces: [],
      spare: null,
    };
  }

  if (e.spare) {
    const sp = e.spare;
    if (!sp.runNumber) {
      const min = (sp.guaranteeHrs || 0) * 60;
      return {
        platMin: min,
        payMin: min,
        matched: true,
        fromSheet: false,
        nonPlatform: e.nonPlatform || 0,
        callup: e.callup || 0,
        booking: e.booking || 0,
        isSunday: !!e.isSunday,
        isStat: !!e.isStat,
        dayOff: false,
        pieces: [],
        spare: sp,
      };
    }
    const runMatches = runIndex[sp.runNumber] || [];
    const runPlatMin = runMatches.length > 0 ? runMatches[0].platmin : 0;
    const standbyMin = (sp.standbyHrsUsed || 0) * 60;
    const totalMin = standbyMin + runPlatMin;
    const pieces: EntryPiece[] =
      runMatches.length > 0
        ? [
            {
              run: sp.runNumber,
              shiftId: "spare",
              shiftPlat: 0,
              shiftPay: 0,
              onTime: runMatches[0].on,
              offTime: runMatches[0].off,
              onLoc: runMatches[0].onloc,
              offLoc: runMatches[0].offloc,
              platMin: runPlatMin,
              allRuns: [sp.runNumber],
            },
          ]
        : [];
    return {
      platMin: totalMin,
      payMin: totalMin,
      matched: runMatches.length > 0,
      fromSheet: false,
      nonPlatform: e.nonPlatform || 0,
      callup: (e.callup || 0) + SPARE_CALLUP_HRS,
      booking: e.booking || 0,
      isSunday: !!e.isSunday,
      isStat: !!e.isStat,
      dayOff: false,
      pieces,
      spare: sp,
    };
  }

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
      dayOff: false,
      pieces: e.pieces || [],
      spare: null,
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
    dayOff: false,
    pieces: e.pieces,
    spare: null,
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
  const regularHrsWithBreak = regMin / 60;
  const otHrs = otMin / 60;
  const regularPayWithBreak = regularHrsWithBreak * settings.baseRate;
  const otPay = otHrs * settings.baseRate * settings.otMultiplier;
  // sumNonPlat/sumCallup/sumBooking are already in hours (entered directly
  // as hours, not minutes) - no /60 conversion needed here.
  const nonPlatPay = sumNonPlat * settings.baseRate;
  const callupPay = sumCallup * settings.baseRate;
  const bookingPay = sumBooking * settings.baseRate;
  const sundayPay =
    sundayHrs * settings.baseRate * (settings.sundayMultiplier - 1);
  const statPay = statDays * settings.statHolidayPay;

  // CLC break time is reported as its own paid line (straight time),
  // matching the real paystub, split back out of the combined pay minutes.
  const clcBreakMinTotal = Math.max(0, sumPay - sumPlat);
  const clcBreakHrs = Math.min(clcBreakMinTotal, regMin) / 60;
  const clcBreakPay = clcBreakHrs * settings.baseRate;
  const regularHrs = regularHrsWithBreak - clcBreakHrs;
  const regularPay = regularPayWithBreak - clcBreakPay;

  const grossPay =
    regularPay +
    clcBreakPay +
    otPay +
    nonPlatPay +
    callupPay +
    bookingPay +
    sundayPay +
    statPay;

  const totalHrs =
    regularHrs +
    clcBreakHrs +
    otHrs +
    sumNonPlat +
    sumCallup +
    sumBooking +
    sundayHrs;

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
    clcBreakHrs,
    clcBreakPay,
    totalHrs,
  };
}

export function getWeekDatesFor(refDate: Date, settings: PaySettings): Date[] {
  return getWeekDates(refDate, settings.weekStart);
}

export function getPayPeriodDatesFor(
  refDate: Date,
  settings: PaySettings
): Date[] {
  const anchor = settings.payPeriodAnchor
    ? new Date(
        parseInt(settings.payPeriodAnchor.slice(0, 4)),
        parseInt(settings.payPeriodAnchor.slice(5, 7)) - 1,
        parseInt(settings.payPeriodAnchor.slice(8, 10))
      )
    : refDate;
  return getPayPeriodDates(refDate, anchor);
}
