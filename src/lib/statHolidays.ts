import { fmtDate } from "./dateUtils";

export interface StatHoliday {
  date: Date;
  name: string;
  category: "general" | "designated";
}

/** Meeus/Jones/Butcher algorithm for the Gregorian Easter Sunday. */
function computeEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** The nth (1-indexed) occurrence of a weekday (0=Sun..6=Sat) in a month. */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number
): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + 7 * (n - 1));
}

/** The last occurrence of a weekday on or before a given day-of-month. */
function lastWeekdayOnOrBefore(
  year: number,
  month: number,
  day: number,
  weekday: number
): Date {
  const d = new Date(year, month, day);
  const diff = (d.getDay() - weekday + 7) % 7;
  return addDays(d, -diff);
}

export function getStatHolidays(year: number): StatHoliday[] {
  const easterSunday = computeEasterSunday(year);
  const goodFriday = addDays(easterSunday, -2);
  const easterMonday = addDays(easterSunday, 1);

  return [
    { date: new Date(year, 0, 1), name: "New Year's Day", category: "general" },
    { date: goodFriday, name: "Good Friday", category: "general" },
    {
      date: lastWeekdayOnOrBefore(year, 4, 24, 1),
      name: "Victoria Day",
      category: "general",
    },
    { date: new Date(year, 6, 1), name: "Canada Day", category: "general" },
    {
      date: nthWeekdayOfMonth(year, 8, 1, 1),
      name: "Labour Day",
      category: "general",
    },
    {
      date: nthWeekdayOfMonth(year, 9, 1, 2),
      name: "Thanksgiving Day",
      category: "general",
    },
    {
      date: new Date(year, 8, 30),
      name: "National Day For Truth and Reconciliation",
      category: "general",
    },
    { date: new Date(year, 10, 11), name: "Remembrance Day", category: "general" },
    { date: new Date(year, 11, 25), name: "Christmas Day", category: "general" },
    { date: new Date(year, 11, 26), name: "Boxing Day", category: "general" },
    {
      date: nthWeekdayOfMonth(year, 7, 1, 1),
      name: "Civic Holiday",
      category: "designated",
    },
    { date: easterMonday, name: "Easter Monday", category: "designated" },
  ];
}

let cache: { year: number; holidays: StatHoliday[] } | null = null;
let holidayByDate: Map<string, StatHoliday> | null = null;

function ensureYear(year: number) {
  if (cache?.year === year) return;
  const holidays = getStatHolidays(year);
  cache = { year, holidays };
  holidayByDate = new Map(holidays.map((h) => [fmtDate(h.date), h]));
}

export function getHolidayForDate(date: Date): StatHoliday | null {
  ensureYear(date.getFullYear());
  return holidayByDate!.get(fmtDate(date)) ?? null;
}
