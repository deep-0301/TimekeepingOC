import { BOARD_DATA } from "./board";
import { rateOn } from "./rate";
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
    const callupHrs =
      startMin != null && SPARE_CALLUP_TIMES_MIN.includes(startMin)
        ? SPARE_CALLUP_HRS
        : 0;

    if (
      (sp.afternoonMode === "work" || sp.afternoonMode === "worked") &&
      sp.runNumber
    ) {
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

      // A floating spare given its run on the call the day before never
      // stood by: it goes straight out on the run, so there is no standby
      // in front of it to pay.
      const standbyBeforeMin =
        sp.afternoonMode === "worked"
          ? 0
          : startMin != null && workOnMin != null
            ? Math.max(0, workOnMin - startMin)
            : 0;

      const shiftPlatMin = shift ? shift[1] : 0;
      const shiftPayMin = shift ? shift[2] : 0;
      const workedMin =
        hasOverride && workOnMin != null && workOffMin != null
          ? Math.max(0, workOffMin - workOnMin)
          : shiftPlatMin;
      const workedPayMin = hasOverride ? workedMin : shiftPayMin;

      // A dispatched spare is never paid less than the guaranteed hours -
      // if the combined standby + worked time falls short, it's bumped up
      // to the guarantee. The guarantee never reduces a legitimately
      // higher figure either, so it is a floor on the time and nothing
      // more.
      const rawPlatMin = standbyBeforeMin + workedMin;
      const guaranteeFloorMin = (sp.guaranteeHrs || 8) * 60;

      // The break the board itself pays on the run that was dispatched.
      // This is paid time that is not platform time, so the guarantee does
      // not absorb it: a spare sent out on a short run still earns the
      // break that run carries, and 8 guaranteed hours plus a half-hour
      // break is 8:30 of pay, not 8:00. Overridden times mean the board's
      // own totals no longer describe what was worked, and the break goes
      // with them - the same rule a partially-matched booked shift uses.
      const clcBreakMin = Math.max(0, workedPayMin - workedMin);

      // AVLC/revised time on a dispatched spare works the same as a
      // booked run - the extra platform credit is how far the revised
      // time falls past the run's actual finish, not the clock value
      // itself.
      const avlcExtraMin =
        e.revisedTimeMin != null && workOffMin != null
          ? Math.max(0, e.revisedTimeMin - workOffMin)
          : 0;

      const platMin = Math.max(rawPlatMin, guaranteeFloorMin) + avlcExtraMin;
      const payMin = platMin + clcBreakMin;

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
        platMin,
        payMin,
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

    // Not dispatched: paid the flat guaranteed standby hours (from the
    // booking sheet's totalGuarantee, or entered directly) by default. If
    // they've recorded standing by until a specific clock time instead,
    // use the actual elapsed time (capped at 8 hours) - this applies the
    // same way whether they reported in the morning or afternoon.
    let standbyMin = (sp.guaranteeHrs || 0) * 60;
    if (
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
  let cumRegularPlatMin = 0;

  const dailyOtThreshMin = settings.otThreshold * 60;
  const periodOtThreshMin = settings.periodOtThreshold * 60;

  // Money is worked out a day at a time rather than from the period's totals,
  // because the rate is not always the same for the whole period. An operator
  // in their first two years steps up on the anniversary of starting, and
  // that day lands mid-period once every eight months - the days before it
  // are paid at the old rate and the days after at the new one, which is what
  // the pay stub will show. With one rate all through, this comes to the
  // same total as multiplying at the end.
  let regularPayWithBreak = 0;
  let otPay = 0;
  let nonPlatPay = 0;
  let callupPay = 0;
  let bookingPay = 0;
  let sundayPay = 0;
  let clcBreakPay = 0;
  let clcBreakMinTotal = 0;
  const ratesUsed = new Set<number>();

  const perDay: DayComputedWithOt[] = days.map((d) => {
    const dateStr = fmtDate(d);
    const dc = computeDay(entries, dateStr);

    // Overtime is always earned on platform/standby time, never the CLC
    // break - but the two work types use different thresholds. Spares earn
    // it day-by-day, once that single day's standby/dispatch time alone
    // passes the daily threshold. Regular booked work only earns it once
    // the pay period's *cumulative* platform hours pass the period
    // threshold - so it's the portion of this day's hours that falls past
    // that running total, not the day's own total.
    let dayOt: number;
    if (dc.spare) {
      dayOt = Math.max(0, dc.platMin - dailyOtThreshMin);
    } else {
      const before = cumRegularPlatMin;
      const after = before + dc.platMin;
      dayOt =
        Math.max(0, after - periodOtThreshMin) -
        Math.max(0, before - periodOtThreshMin);
      cumRegularPlatMin = after;
    }

    otMin += dayOt;
    sumPlat += dc.platMin;
    sumPay += dc.payMin;
    sumNonPlat += dc.nonPlatform;
    sumCallup += dc.callup;
    sumBooking += dc.booking;
    if (dc.isStat) statDays++;
    if (dc.isSunday) sundayHrs += dc.payMin / 60;

    // What this day was worth, at the rate in force on this day.
    const rate = rateOn(settings.serviceStart, dateStr) ?? settings.baseRate;
    ratesUsed.add(rate);
    // Overtime is never on the CLC break, so a day's regular minutes are
    // whatever is left of its paid minutes once its own overtime is out.
    const dayRegMin = Math.max(0, dc.payMin - dayOt);
    // The break is paid at straight time and reported on its own line, so it
    // is taken out of the regular minutes rather than counted twice.
    const dayClcMin = Math.min(Math.max(0, dc.payMin - dc.platMin), dayRegMin);
    clcBreakMinTotal += dayClcMin;
    regularPayWithBreak += (dayRegMin / 60) * rate;
    clcBreakPay += (dayClcMin / 60) * rate;
    otPay += (dayOt / 60) * rate * settings.otMultiplier;
    nonPlatPay += dc.nonPlatform * rate;
    callupPay += dc.callup * rate;
    bookingPay += dc.booking * rate;
    if (dc.isSunday) {
      sundayPay += (dc.payMin / 60) * rate * (settings.sundayMultiplier - 1);
    }
    return { dateStr, ...dc, dayOt };
  });

  const regMin = Math.max(0, sumPay - otMin);
  const regularHrsWithBreak = regMin / 60;
  const otHrs = otMin / 60;
  // Stat holiday pay is a day's money, not an hourly rate, so it does not
  // step with service.
  const statPay = statDays * settings.statHolidayPay;

  // CLC break time is reported as its own paid line (straight time),
  // matching the real paystub, split back out of the combined pay minutes.
  const clcBreakHrs = clcBreakMinTotal / 60;
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
    // The rates this period was actually paid at, lowest first. More than one
    // means a raise landed part-way through it.
    rates: [...ratesUsed].sort((a, b) => a - b),
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
