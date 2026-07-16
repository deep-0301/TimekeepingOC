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
  rows: SheetRow[];
  totalPlat: string | null;
  totalPay: string | null;
  date: Date | null;
}

function extractTimeTokens(s: string) {
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
): { anchorDate: Date | null; blocks: SheetBlock[] } {
  const rawLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const blocks: SheetBlock[] = [];
  let current: SheetBlock | null = null;
  let anchorDate: Date | null = manualAnchor || null;

  function pushCurrent() {
    if (current) blocks.push(current);
    current = null;
  }

  for (const line of rawLines) {
    const seasonMatch = line.match(/^(\d{8})\s*-\s*.*\d{8}\s*$/);
    if (seasonMatch && !manualAnchor && !anchorDate) {
      const s = seasonMatch[1];
      anchorDate = new Date(
        parseInt(s.slice(0, 4)),
        parseInt(s.slice(4, 6)) - 1,
        parseInt(s.slice(6, 8))
      );
      continue;
    }
    if (/^EMPLOYEE BOOKING SHEET$/i.test(line)) continue;
    if (/^\d{6}\s+[A-Za-z]/.test(line)) continue;
    if (/^GENERAL SPARE$/i.test(line)) continue;
    if (/^Days Off to be Taken/i.test(line)) continue;
    if (/^DAYS OFF$/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (/^DAY OFF$/i.test(line)) {
      if (current) (current as SheetBlock).isDayOff = true;
      continue;
    }

    const times = extractTimeTokens(line);
    if (times.length === 0) {
      const wdMatch = line.match(
        /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(\d+)(\s+SPARE)?$/i
      );
      const dateMatch = line.match(/^(.+?)\s+(\d{1,2}-[A-Za-z]{3,9}-\d{4})$/);
      if (wdMatch) {
        pushCurrent();
        current = {
          label: line,
          weekday: wdMatch[1].toLowerCase(),
          cycleN: parseInt(wdMatch[2]),
          explicitDate: null,
          isHoliday: false,
          isDayOff: false,
          rows: [],
          totalPlat: null,
          totalPay: null,
          date: null,
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
          rows: [],
          totalPlat: null,
          totalPay: null,
          date: null,
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

  return { anchorDate, blocks };
}
