import { getHolidayForDate } from "./statHolidays";

const WEEKDAYS7 = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS3: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export interface SheetRow {
  shiftCode: string;
  run: string;
  onLoc: string;
  onTime: string;
  offTime: string;
  offLoc: string;
  segPlat: string | null;
  segPay: string | null;
  totalGuarantee: string | null;
  isSpare: boolean;
}

export interface SheetBlock {
  label: string;
  weekday: string | null;
  cycleN: number | null;
  explicitDate: Date | null;
  isHoliday: boolean;
  isDayOff: boolean;
  /** A "DAILY" block: the same work every Monday-Friday, all season, with
   * no alternating cycle (unlike a weekday+cycleN block). */
  isDaily: boolean;
  rows: SheetRow[];
  totalPlat: string | null;
  totalPay: string | null;
  date: Date | null;
  /** All dates this block's pattern applies to across the season (repeat occurrences). */
  dates: Date[];
}

export function extractTimeTokens(s: string) {
  const matches = [...s.matchAll(/\d{1,2}[:h]\d{2}/g)];
  return matches.map((m) => ({
    text: m[0].replace("h", ":"),
    index: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
}

function parseExplicitDate(str: string): Date | null {
  const m = str.match(/(\d{1,2})-([A-Za-z]{3,9})-(\d{4})/);
  if (!m) return null;
  const mon = MONTHS3[m[2].slice(0, 3).toLowerCase()];
  if (mon === undefined) return null;
  return new Date(parseInt(m[3]), mon, parseInt(m[1]));
}

export function hmToMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function parseBookingSheetText(
  text: string,
  manualAnchor: Date | null
): { anchorDate: Date | null; seasonEndDate: Date | null; blocks: SheetBlock[] } {
  const rawLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const blocks: SheetBlock[] = [];
  let current: SheetBlock | null = null;
  let anchorDate: Date | null = manualAnchor || null;
  let seasonEndDate: Date | null = null;
  let inDaysOffSection = false;
  const DAYS_OFF_ENTRY_RE =
    /(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*-\s*(\d+)/gi;

  function pushCurrent() {
    if (current) blocks.push(current);
    current = null;
  }

  function ymd8(s: string): Date {
    return new Date(
      parseInt(s.slice(0, 4)),
      parseInt(s.slice(4, 6)) - 1,
      parseInt(s.slice(6, 8))
    );
  }

  for (const line of rawLines) {
    const seasonMatch = line.match(/^(\d{8})\s*-\s*.*?(\d{8})\s*$/);
    if (seasonMatch) {
      if (!manualAnchor && !anchorDate) anchorDate = ymd8(seasonMatch[1]);
      if (!seasonEndDate) seasonEndDate = ymd8(seasonMatch[2]);
      continue;
    }
    if (/^EMPLOYEE BOOKING SHEET$/i.test(line)) continue;
    if (/^\d{6}\s+[A-Za-z]/.test(line)) continue;
    if (/^GENERAL SPARE$/i.test(line)) continue;
    if (/^Days Off to be Taken/i.test(line)) continue;
    if (/^DAYS OFF$/i.test(line)) {
      pushCurrent();
      inDaysOffSection = true;
      continue;
    }
    if (/^\d+$/.test(line)) continue;
    if (/^DAY OFF$/i.test(line)) {
      if (current) (current as SheetBlock).isDayOff = true;
      continue;
    }

    if (inDaysOffSection) {
      // The season-wide days-off summary (e.g. "Tuesday - 1  Sunday - 2")
      // uses the same weekday+cycle-position convention as the Saturday/
      // Sunday work blocks above it - each pair becomes its own recurring
      // day-off block, so it overrides whatever a DAILY/weekday block
      // would otherwise have marked as a working day that cycle position.
      DAYS_OFF_ENTRY_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DAYS_OFF_ENTRY_RE.exec(line))) {
        blocks.push({
          label: `${m[1]} - ${m[2]} (day off)`,
          weekday: m[1].toLowerCase(),
          cycleN: parseInt(m[2]),
          explicitDate: null,
          isHoliday: false,
          isDayOff: true,
          isDaily: false,
          rows: [],
          totalPlat: null,
          totalPay: null,
          date: null,
          dates: [],
        });
      }
      continue;
    }

    const times = extractTimeTokens(line);
    if (times.length === 0) {
      const dailyMatch = /^DAILY$/i.test(line);
      const wdMatch = line.match(
        /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(\d+)(\s+SPARE)?$/i
      );
      const dateMatch = line.match(/^(.+?)\s+(\d{1,2}-[A-Za-z]{3,9}-\d{4})$/);
      if (dailyMatch) {
        pushCurrent();
        current = {
          label: line,
          weekday: null,
          cycleN: null,
          explicitDate: null,
          isHoliday: false,
          isDayOff: false,
          isDaily: true,
          rows: [],
          totalPlat: null,
          totalPay: null,
          date: null,
          dates: [],
        };
      } else if (wdMatch) {
        pushCurrent();
        current = {
          label: line,
          weekday: wdMatch[1].toLowerCase(),
          cycleN: parseInt(wdMatch[2]),
          explicitDate: null,
          isHoliday: false,
          isDayOff: false,
          isDaily: false,
          rows: [],
          totalPlat: null,
          totalPay: null,
          date: null,
          dates: [],
        };
      } else if (dateMatch) {
        pushCurrent();
        const d = parseExplicitDate(dateMatch[2]);
        current = {
          label: line,
          weekday: null,
          cycleN: null,
          explicitDate: d,
          isHoliday: true,
          isDayOff: false,
          isDaily: false,
          rows: [],
          totalPlat: null,
          totalPay: null,
          date: null,
          dates: [],
        };
      }
      continue;
    }

    if (times.length === 2) {
      if (current) {
        current.totalPlat = times[0].text;
        current.totalPay = times[1].text;
      }
      continue;
    }

    if (times.length === 4 || times.length === 3) {
      const firstToken = line.split(/\s+/)[0];
      const onIdxInLine = times[0].index;
      const preText = line.slice(firstToken.length, onIdxInLine).trim();
      const preTokens = preText.split(/\s+/);
      const runCode = preTokens[0] || "";
      const onLoc = preTokens.slice(1).join(" ");
      const offLoc = line.slice(times[1].end, times[2].index).trim();
      const row: SheetRow = {
        shiftCode: firstToken,
        run: runCode,
        onLoc,
        onTime: times[0].text,
        offTime: times[1].text,
        offLoc,
        segPlat: null,
        segPay: null,
        totalGuarantee: null,
        isSpare: false,
      };
      if (times.length === 4) {
        row.segPlat = times[2].text;
        row.segPay = times[3].text;
        row.totalGuarantee = null;
        row.isSpare = false;
      } else {
        row.segPlat = null;
        row.segPay = null;
        row.totalGuarantee = times[2].text;
        row.isSpare =
          /spare/i.test(offLoc) ||
          /spare/i.test(onLoc) ||
          /^[A-Z]\d{3,4}$/.test(firstToken);
      }
      if (current) current.rows.push(row);
      continue;
    }
  }
  pushCurrent();

  blocks.forEach((b) => {
    if (b.explicitDate) {
      b.date = b.explicitDate;
    } else if (anchorDate && b.weekday) {
      const wIdx = WEEKDAYS7.indexOf(b.weekday);
      const aIdx = anchorDate.getDay();
      const offsetInWeek = (wIdx - aIdx + 7) % 7;
      const d = new Date(anchorDate);
      d.setDate(d.getDate() + 7 * ((b.cycleN ?? 1) - 1) + offsetInWeek);
      b.date = d;
    } else {
      b.date = null;
    }
  });

  /**
   * A stat holiday is not an ordinary day of that name.
   *
   * On Thanksgiving the work comes off the STAT board, which is different
   * work entirely - different shift numbers, different times, different
   * hours. Letting the Monday pattern repeat onto it fills the day with a
   * shift nobody is booked to drive and puts wrong hours into the pay.
   *
   * Only repeats are held back. A block the sheet dates explicitly is the
   * holiday assignment itself and belongs exactly where it says.
   */
  const isStat = (d: Date) => getHolidayForDate(d) !== null;

  // A weekday+cycle block's pattern repeats every `cycleLength` weeks for
  // the rest of the season (e.g. a 2-week bid cycle repeats all summer).
  // Explicit-date (holiday) blocks are one-off and never repeat.
  const cycleLength = blocks.reduce(
    (max, b) => (b.weekday && b.cycleN ? Math.max(max, b.cycleN) : max),
    0
  );
  blocks.forEach((b) => {
    if (b.isDaily) {
      const dates: Date[] = [];
      if (anchorDate) {
        const end = seasonEndDate ?? anchorDate;
        const d = new Date(anchorDate);
        while (d <= end) {
          const dow = d.getDay();
          if (dow >= 1 && dow <= 5 && !isStat(d)) dates.push(new Date(d));
          d.setDate(d.getDate() + 1);
        }
      }
      b.dates = dates;
    } else if (!b.date) {
      b.dates = [];
    } else if (b.explicitDate || !b.weekday || cycleLength <= 1) {
      b.dates = [b.date];
    } else {
      const dates: Date[] = [];
      const d = new Date(b.date);
      const end = seasonEndDate ?? b.date;
      while (d <= end) {
        if (!isStat(d)) dates.push(new Date(d));
        d.setDate(d.getDate() + 7 * cycleLength);
      }
      b.dates = dates;
    }
  });

  return { anchorDate, seasonEndDate, blocks };
}
