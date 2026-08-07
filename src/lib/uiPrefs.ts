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

/**
 * A choice that holds for today and no longer.
 *
 * Which book you were last looking at is worth keeping while you work - being
 * thrown back to a different one on every visit was the original complaint.
 * Keeping it for ever is the opposite mistake: come back on a Saturday and
 * the page opens on Friday's weekday book, which is wrong in a way that is
 * easy to miss. Stamping the choice with its date settles both.
 */
export function readPrefToday(key: string, today: string): string | null {
  const raw = readPref(key);
  if (!raw) return null;
  const cut = raw.indexOf("|");
  if (cut < 0) return null;
  return raw.slice(0, cut) === today ? raw.slice(cut + 1) : null;
}

export function writePrefToday(key: string, today: string, value: string): void {
  writePref(key, `${today}|${value}`);
}

export function writePref(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* nothing to do - the choice just will not be remembered */
  }
}
