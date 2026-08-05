/**
 * Which bus was working which paddle, remembered for the day.
 *
 * A paddle between trips is on no route, so there is nothing for the feed to
 * be asked - the live search that finds a bus while it is running has no
 * handle on it at all during a layover, at sign-on, or after sign-off.
 *
 * The way through is to write the answer down while it is knowable. Once a
 * bus has been identified for a paddle, that fleet number can be looked up
 * directly for the rest of the day, whatever the paddle is doing.
 *
 * Kept in localStorage, and stamped with the date: bus assignments are made
 * fresh every morning, so yesterday's answer is worse than none. Losing it
 * costs nothing - the page falls back to saying no bus has been identified
 * yet.
 */

import { readPref, writePref } from "./uiPrefs";

export interface RememberedBus {
  /** yyyy-mm-dd, so an assignment is never carried into the next day. */
  date: string;
  fleet: string;
  /** Unix seconds when the bus was last confirmed on this paddle. */
  at: number;
  lat?: number;
  lon?: number;
  /** The paddle timepoint it was nearest, for when it drops off the feed. */
  place?: string;
}

function key(paddleNumber: string): string {
  return `paddleBus:${paddleNumber}`;
}

export function rememberBus(paddleNumber: string, bus: RememberedBus): void {
  writePref(key(paddleNumber), JSON.stringify(bus));
}

export function recallBus(
  paddleNumber: string,
  today: string,
): RememberedBus | null {
  const raw = readPref(key(paddleNumber));
  if (!raw) return null;
  try {
    const bus = JSON.parse(raw) as RememberedBus;
    if (!bus || bus.date !== today || !bus.fleet) return null;
    return bus;
  } catch {
    // Written by an older version, or corrupted. Either way it is not worth
    // showing a bus number we cannot vouch for.
    return null;
  }
}
