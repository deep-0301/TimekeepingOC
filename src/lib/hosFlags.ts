/**
 * Which days are in breach, for the parts of the app that only need to say
 * so rather than show the whole picture.
 *
 * The calendar and Day Details both mark days that break an hours-of-service
 * limit. Working that out twice would be two chances to disagree with the
 * Hours of Service page, so both come through here and it comes through
 * `hosRows` - the same function the page itself renders from.
 */
import { hosRows, type HosCycle, type HosDayRow } from "./hos";
import type { EntriesMap } from "./types";

/**
 * Cycle 1 unless told otherwise.
 *
 * The Hours of Service page lets the cycle be switched and starts on cycle 1;
 * a marker in the calendar has nowhere to ask. Cycle 1 is the tighter of the
 * two over a week, so defaulting to it warns rather than reassures - and the
 * cycle limits are the only rules the choice affects. Every daily rule, the
 * rest rule included, reads the same either way.
 */
export const DEFAULT_HOS_CYCLE: HosCycle = "cycle1";

/** Breached days among the dates given, keyed by date. */
export function hosBreaches(
  dateStrs: string[],
  entries: EntriesMap,
  cycle: HosCycle = DEFAULT_HOS_CYCLE
): Map<string, HosDayRow> {
  const out = new Map<string, HosDayRow>();
  for (const row of hosRows(dateStrs, entries, cycle)) {
    if (row.breaches.length > 0) out.set(row.dateStr, row);
  }
  return out;
}

/** The one day, when only one is being looked at. */
export function hosBreachFor(
  dateStr: string,
  entries: EntriesMap,
  cycle: HosCycle = DEFAULT_HOS_CYCLE
): HosDayRow | null {
  const [row] = hosRows([dateStr], entries, cycle);
  return row && row.breaches.length > 0 ? row : null;
}
