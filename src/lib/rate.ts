/**
 * What an operator is paid an hour, and when that changes.
 *
 * A new bus operator does not start on the full rate. The collective
 * agreement steps them up by months of service after training:
 *
 *   months  1-8   85% of the Bus Operator rate
 *   months  9-16  90%
 *   months 17-24  95%
 *   after 24      100%
 *
 * That is three raises in the first two years, each on the anniversary of
 * starting. An operator typing their rate in by hand has to remember to
 * change it on the right day, and every pay period after they forget is
 * wrong - so the date is asked for once and the rate follows from it.
 *
 * The percentages are the agreement's; the dollars are the 2026 rates. When
 * the full rate changes, only FULL_RATE below moves.
 */

import { parseDateStr } from "./dateUtils";

/** The 2026 Bus Operator rate, which every step is a percentage of. */
export const FULL_RATE = 37.91;

export interface RateStep {
  /** Months of service this step starts at. */
  fromMonth: number;
  /** Months of service it ends after; null for the full rate. */
  toMonth: number | null;
  /** Share of the Bus Operator rate. */
  share: number;
  rate: number;
}

/**
 * The published dollar figures rather than FULL_RATE * share.
 *
 * 85% of 37.910 is 32.2235, which the agreement prints as 32.224. An
 * operator checking this against their pay stub should find the number they
 * were shown, so the printed figures are what is used.
 */
export const RATE_STEPS: readonly RateStep[] = [
  { fromMonth: 0, toMonth: 8, share: 0.85, rate: 32.224 },
  { fromMonth: 8, toMonth: 16, share: 0.9, rate: 34.119 },
  { fromMonth: 16, toMonth: 24, share: 0.95, rate: 36.015 },
  { fromMonth: 24, toMonth: null, share: 1, rate: FULL_RATE },
];

/**
 * Whole months between two dates.
 *
 * Counted the way service is: someone who started on the 3rd has completed a
 * month on the 3rd of the next month, whatever its length. The day of the
 * month is compared directly, so a start on the 31st completes its month on
 * the 1st of the month after a short one - which is the same answer a payroll
 * clerk gives.
 */
export function monthsOfService(startStr: string, onStr: string): number {
  const start = parseDateStr(startStr);
  const on = parseDateStr(onStr);
  let months =
    (on.getFullYear() - start.getFullYear()) * 12 +
    (on.getMonth() - start.getMonth());
  if (on.getDate() < start.getDate()) months--;
  return Math.max(0, months);
}

/** The step in force after this many completed months. */
export function stepForMonths(months: number): RateStep {
  return (
    RATE_STEPS.find((s) => s.toMonth === null || months < s.toMonth) ??
    RATE_STEPS[RATE_STEPS.length - 1]
  );
}

/**
 * The rate on a given date, or null where the start date is not known.
 *
 * Null rather than a guess: an operator who has not said when they started
 * should keep whatever rate they typed in, not be moved onto one the app
 * made up for them.
 */
export function rateOn(startStr: string | undefined, onStr: string): number | null {
  if (!startStr || !/^\d{4}-\d{2}-\d{2}$/.test(startStr)) return null;
  return stepForMonths(monthsOfService(startStr, onStr)).rate;
}

/** The step in force on a date, where the start date is known. */
export function stepOn(startStr: string | undefined, onStr: string): RateStep | null {
  if (!startStr || !/^\d{4}-\d{2}-\d{2}$/.test(startStr)) return null;
  return stepForMonths(monthsOfService(startStr, onStr));
}

/**
 * When the next raise lands, and what it will be.
 *
 * Null once they are on the full rate - there is no next step to wait for.
 */
export function nextStep(
  startStr: string | undefined,
  onStr: string,
): { date: string; step: RateStep } | null {
  if (!startStr || !/^\d{4}-\d{2}-\d{2}$/.test(startStr)) return null;
  const now = stepForMonths(monthsOfService(startStr, onStr));
  if (now.toMonth === null) return null;

  const start = parseDateStr(startStr);
  const at = new Date(start);
  at.setMonth(at.getMonth() + now.toMonth);
  // Rolling a month forward from the 31st lands in the following month; the
  // anniversary is the last day of the shorter one.
  if (at.getDate() !== start.getDate()) at.setDate(0);

  const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(
    at.getDate(),
  ).padStart(2, "0")}`;
  return { date, step: stepForMonths(now.toMonth) };
}

/** How a step reads on screen: "85% of the Bus Operator rate". */
export function describeStep(step: RateStep): string {
  return step.share === 1
    ? "the full Bus Operator rate"
    : `${Math.round(step.share * 100)}% of the Bus Operator rate`;
}
