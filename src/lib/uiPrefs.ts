/**
 * Small UI choices that should survive a reload.
 *
 * Kept in localStorage rather than in the Supabase settings row: which board
 * or paddle book you last looked at is a convenience, not payroll data, and
 * it should not cost a round trip or a write on every tap. Losing it is
 * harmless - the caller falls back to whatever the date implies.
 */

const PREFIX = "runsheet:";

export function readPref(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    // Private browsing and blocked storage both throw; a missing preference
    // is not worth breaking a page over.
    return null;
  }
}

export function writePref(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* nothing to do - the choice just will not be remembered */
  }
}
