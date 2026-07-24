import { BOARD_DATA } from "./board";
import {
  fmtDate,
  getPayPeriodDates,
  getWeekDates,
  isSundayDate,
  minToHHMM,
  toMin,
} from "./dateUtils";
import type {
  DayComputed,
  DayComputedWithOt,
  EntriesMap,
  EntryPiece,
  PaySettings,
  WeekComputed,
} from "./types";

const SPARE_CALLUP_HRS = 0.5;
const SPARE_MAX_STANDBY_MIN = 8 * 60;
/** Spares reporting before 9:30 are simple flat-standby-hours days; 9:30
 * onward they must record whether they were dispatched or stood by. */
export const SPARE_AM_CUTOFF_MIN = 9 * 60 + 30;
/** A spare reporting at exactly one of these clock times always gets a flat
 * 30-minute callup, whether or not they end up dispatched. */
export const SPARE_CALLUP_TIMES_MIN = [
  9 * 60 + 30,
  12 * 60 + 30,
  14 * 60 + 30,
  16 * 60 + 30,
  18 * 60 + 30,
];

/** Groups pieces by shiftId - if the set of runs added for a shift equals
 * that shift's full run list, use the shift's authoritative (board) total. */
function groupPiecesPlatPay(pieces: EntryPiece[]): {
  platMin: number;
  payMin: number;
  matched: boolean;
} {
  const byShift: Record<string, EntryPiece[]> = {};
  pieces.forEach((p) => {
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
  return { platMin, payMin, matched };
}

const EMPTY_DAY: Omit<DayComputed, "isSunday"> = {
  platMin: 0,
  payMin: 0,
  matched: false,
  fromSheet: false,
  nonPlatform: 0,
  callup: 0,
  booking: 0,
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
  const isSunday = isSundayDate(dateStr);
  if (!e) return { ...EMPTY_DAY, isSunday };

  if (e.dayOff) {
    // A day off can still have overtime pieces added on top (called in to
    // work on a scheduled day off) - those count as platform hours as usual.
    const overtimePieces = e.pieces || [];
    const { platMin, payMin, matched } = overtimePieces.length
      ? groupPiecesPlatPay(overtimePieces)
      : { platMin: 0, payMin: 0, matched: true };
    return {
      platMin,
      payMin,
      matched,
      fromSheet: false,
      nonPlatform: 0,
      callup: 0,
      booking: e.booking || 0,
      isSunday,
      isStat: !!e.isStat,
      dayOff: true,
      pieces: overtimePieces,
      spare: null,
    };
  }

  if (e.spare) {
    const sp = e.spare;
    const startMin = sp.startMin ?? null;
    const isMorning = startMin == null || startMin < SPARE_AM_CUTOFF_MIN;
    const callupHrs =
      startMin != null && SPARE_CALLUP_TIMES_MIN.includes(startMin)
        ? SPARE_CALLUP_HRS
        : 0;

    if (!isMorning && sp.afternoonMode === "work" && sp.runNumber) {
      // Dispatched: standby time from report to the run's actual start,
      // plus the run's own worked time - using manual overrides when the
      // operator's actual times differed from the board (e.g. a shortened
      // spread), otherwise the board's own authoritative totals.
      const shift =
        sp.shiftIndex != null ? BOARD_DATA[sp.shiftIndex] : undefined;
      const boardOnMin = shift ? toMin(shift[3][0][1]) : null;
      const boardOffMin = shift
        ? toMin(shift[3][shift[3].length - 1][2])
        : null;
      const workOnMin = sp.workOnTimeOverride ?? boardOnMin;
      const workOffMin = sp.workOffTimeOverride ?? boardOffMin;
      const hasOverride =
        sp.workOnTimeOverride != null || sp.workOffTimeOverride != null;

      const standbyBeforeMin =
        startMin != null && workOnMin != null
          ? Math.max(0, workOnMin - startMin)
          : 0;

      const shiftPlatMin = shift ? shift[1] : 0;
      const shiftPayMin = shift ? shift[2] : 0;
      const workedMin =
        hasOverride && workOnMin != null && workOffMin != null
          ? Math.max(0, workOffMin - workOnMin)
          : shiftPlatMin;
      const workedPayMin = hasOverride ? workedMin : shiftPayMin;

      const allRuns = shift ? shift[3].map((r) => r[0]) : [];
      const pieces: EntryPiece[] = shift
        ? shift[3].map((r, idx, arr): EntryPiece => {
            const isFirst = idx === 0;
            const isLast = idx === arr.length - 1;
            return {
              run: r[0],
              shiftId: shift[0],
              shiftPlat: shift[1],
              shiftPay: shift[2],
              onTime:
                isFirst && sp.workOnTimeOverride != null
                  ? minToHHMM(sp.workOnTimeOverride)
                  : r[1],
              offTime:
                isLast && sp.workOffTimeOverride != null
                  ? minToHHMM(sp.workOffTimeOverride)
                  : r[2],
              onLoc: r[3],
              offLoc: r[4],
              platMin: r[5],
              allRuns,
            };
          })
        : [];

      return {
        platMin: standbyBeforeMin + workedMin,
        payMin: standbyBeforeMin + workedPayMin,
        matched: !!shift,
        fromSheet: false,
        nonPlatform: e.nonPlatform || 0,
        callup: callupHrs,
        booking: e.booking || 0,
        isSunday,
        isStat: !!e.isStat,
        dayOff: false,
        pieces,
        spare: sp,
      };
    }

    // Flat standby hours: morning spares (always), or a PM spare who chose
    // "standby" (paid from report time to when standby ended, capped at 8
    // hours), or who hasn't recorded an outcome yet.
    let standbyMin = 0;
    if (isMorning) {
      standbyMin = (sp.guaranteeHrs || 0) * 60;
    } else if (
      sp.afternoonMode === "standby" &&
      startMin != null &&
      sp.standbyEndMin != null
    ) {
      let diff = sp.standbyEndMin - startMin;
      if (diff < 0) diff += 24 * 60;
      standbyMin = Math.min(diff, SPARE_MAX_STANDBY_MIN);
    }

    return {
      platMin: standbyMin,
      payMin: standbyMin,
      matched: true,
      fromSheet: false,
      nonPlatform: e.nonPlatform || 0,
      callup: callupHrs,
      booking: e.booking || 0,
      isSunday,
      isStat: !!e.isStat,
      dayOff: false,
      pieces: [],
      spare: sp,
    };
  }

  if (e.fromSheet) {
    // AVLC/revised time are clock times, not durations - the extra platform
    // credit is how far the revised time falls past the shift's scheduled
    // finish (the last piece's off time), not the clock value itself.
    const lastPiece = e.pieces?.[e.pieces.length - 1];
    const scheduledOffMin = lastPiece ? toMin(lastPiece.offTime) : null;
    const extraMin =
      e.revisedTimeMin != null && scheduledOffMin != null
        ? Math.max(0, e.revisedTimeMin - scheduledOffMin)
        : 0;
    return {
      platMin: (e.sheetPlat || 0) + extraMin,
      payMin: (e.sheetPay || 0) + extraMin,
      matched: true,
      fromSheet: true,
      nonPlatform: 0,
      callup: 0,
      booking: 0,
      isSunday,
      isStat: !!e.isStat,
      dayOff: false,
      pieces: e.pieces || [],
      spare: null,
    };
  }

  const { platMin, payMin, matched } = groupPiecesPlatPay(e.pieces);

  return {
    platMin,
    payMin,
    matched,
    fromSheet: false,
    nonPlatform: 0,
    callup: 0,
    booking: e.booking || 0,
    isSunday,
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
