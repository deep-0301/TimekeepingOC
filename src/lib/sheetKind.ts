/**
 * Working out what kind of booking sheet this is, so nobody has to say.
 *
 * There are two formats, and they look nothing like each other: the ordinary
 * booking sheet, and the holiday spare sheet organised into WEEK N blocks.
 * The app used to ask which booking the operator held and then offer the
 * matching boxes, which put the question the wrong way round - the sheet in
 * their hand already knows what it is.
 *
 * Nothing here reads the layout looking for a marker. Both parsers are run
 * and the one that actually recognises the sheet wins, so this cannot drift
 * away from what they accept: if a parser learns a new variant, detection
 * learns it at the same moment.
 */

import { parseBookingSheetText, type SheetBlock } from "./bookingSheetParser";
import { parseHolidaySpareSheet, type HolidayDayPlan } from "./holidaySpareParser";

export type SheetKind = "booking" | "holidaySpare" | "unrecognised";

export interface DetectedBooking {
  kind: "booking";
  blocks: SheetBlock[];
  anchorDate: Date | null;
  seasonEndDate: Date | null;
}

export interface DetectedHoliday {
  kind: "holidaySpare";
  plans: HolidayDayPlan[];
}

export interface DetectedNothing {
  kind: "unrecognised";
}

export type Detected = DetectedBooking | DetectedHoliday | DetectedNothing;

/** A block only counts if it says something: work, or an explicit day off. */
function usable(blocks: SheetBlock[]): SheetBlock[] {
  return blocks.filter((b) => b.isDayOff || b.rows.length > 0);
}

function tryBooking(text: string): DetectedBooking | null {
  try {
    const { blocks, anchorDate, seasonEndDate } = parseBookingSheetText(text, null);
    const worth = usable(blocks);
    if (worth.length === 0) return null;
    return { kind: "booking", blocks: worth, anchorDate, seasonEndDate };
  } catch {
    return null;
  }
}

function tryHoliday(text: string): DetectedHoliday | null {
  try {
    const plans = parseHolidaySpareSheet(text);
    if (plans.length === 0) return null;
    return { kind: "holidaySpare", plans };
  } catch {
    return null;
  }
}

/**
 * Which sheet this is, decided by which parser makes sense of it.
 *
 * Where both do - the formats share a vocabulary of times and run numbers, so
 * one can find fragments in the other - the one that accounted for more of
 * the document is taken. A parser reading its own format explains nearly all
 * of it; a parser reading the wrong one picks up scraps.
 */
export function detectSheet(text: string): Detected {
  if (!text.trim()) return { kind: "unrecognised" };

  const booking = tryBooking(text);
  const holiday = tryHoliday(text);

  if (booking && holiday) {
    return holiday.plans.length > booking.blocks.length ? holiday : booking;
  }
  return booking ?? holiday ?? { kind: "unrecognised" };
}

/** What was found, for the operator to check before importing. */
export function describeSheet(found: Detected): string {
  if (found.kind === "booking") {
    return found.blocks.length === 1
      ? "Booking sheet — 1 block"
      : `Booking sheet — ${found.blocks.length} blocks`;
  }
  if (found.kind === "holidaySpare") {
    const weeks = new Set(found.plans.map((p) => p.weekLabel)).size;
    return (
      `Holiday spare sheet — ${found.plans.length} day` +
      `${found.plans.length === 1 ? "" : "s"} across ${weeks} week` +
      `${weeks === 1 ? "" : "s"}`
    );
  }
  return "Not recognised as a booking sheet";
}
