export function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fmtHM(mins: number): string {
  const sign = mins < 0 ? "-" : "";
  mins = Math.abs(mins);
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Sunday is a fixed fact about a calendar date — never a manual entry. */
export function isSundayDate(dateStr: string): boolean {
  return parseDateStr(dateStr).getDay() === 0;
}

export function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function getWeekDates(
  ref: Date,
  weekStart: "sunday" | "monday"
): Date[] {
  const d = new Date(ref);
  const dow = d.getDay();
  const diffToStart =
    weekStart === "monday" ? (dow === 0 ? -6 : 1 - dow) : -dow;
  const start = new Date(d);
  start.setDate(d.getDate() + diffToStart);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return days;
}

const MS_PER_DAY = 86400000;

/**
 * The 14-day biweekly pay period containing `ref`, aligned so that
 * `anchor` (any known period-start date) always begins a period.
 */
export function getPayPeriodDates(ref: Date, anchor: Date): Date[] {
  const refMid = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const anchorMid = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate()
  );
  const diffDays = Math.round(
    (refMid.getTime() - anchorMid.getTime()) / MS_PER_DAY
  );
  const periodIndex = Math.floor(diffDays / 14);
  const start = new Date(anchorMid);
  start.setDate(start.getDate() + periodIndex * 14);
  const days: Date[] = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return days;
}
