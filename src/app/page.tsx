"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BOARD_DATA } from "@/lib/board";
import { fmtDate, parseDateStr } from "@/lib/dateUtils";
import { computeWeek, getPayPeriodDatesFor } from "@/lib/pay";
import { store } from "@/lib/storage";
import {
  DEFAULT_SETTINGS,
  newEmptyDayEntry,
  type DayFieldName,
  type EntriesMap,
  type EntryPiece,
  type PaySettings,
  type SpareInfo,
} from "@/lib/types";

import Header from "@/components/Header";
import WeekNav from "@/components/WeekNav";
import SettingsPanel from "@/components/SettingsPanel";
import RunSearch from "@/components/RunSearch";
import BookingSheetImport from "@/components/BookingSheetImport";
import MonthCalendar from "@/components/MonthCalendar";
import SummaryTable from "@/components/SummaryTable";

export default function Home() {
  const [settings, setSettings] = useState<PaySettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<EntriesMap>({});
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [statusLine, setStatusLine] = useState("Loading…");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const [s, e] = await Promise.all([
        store.loadSettings(),
        store.loadEntries(),
      ]);
      setSettings(s);
      setEntries(e);
      setStatusLine(
        `Ready · ${BOARD_DATA.length} shifts loaded from the Summer Weekday Boards`
      );
    })();
  }, []);

  const saveEntriesDebounced = useCallback((next: EntriesMap) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatusLine("Saving…");
    saveTimer.current = setTimeout(async () => {
      try {
        await store.saveEntries(next);
        setStatusLine("Saved · stored only for you");
      } catch {
        setStatusLine("Could not save — try again");
      }
    }, 400);
  }, []);

  const updateEntries = useCallback(
    (updater: (prev: EntriesMap) => EntriesMap) => {
      setEntries((prev) => {
        const next = updater(prev);
        saveEntriesDebounced(next);
        return next;
      });
    },
    [saveEntriesDebounced]
  );

  const addShiftToDate = useCallback(
    (si: number, dateStr: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
      const shift = BOARD_DATA[si];
      const allRuns = shift[3].map((r) => r[0]);
      updateEntries((prev) => {
        const next = { ...prev };
        const day = next[dateStr]
          ? { ...next[dateStr], pieces: [...next[dateStr].pieces] }
          : newEmptyDayEntry();
        day.pieces = day.pieces.filter((p) => p.shiftId !== shift[0]);
        shift[3].forEach((runData) => {
          const piece: EntryPiece = {
            run: runData[0],
            shiftId: shift[0],
            shiftPlat: shift[1],
            shiftPay: shift[2],
            onTime: runData[1],
            offTime: runData[2],
            onLoc: runData[3],
            offLoc: runData[4],
            platMin: runData[5],
            allRuns,
          };
          day.pieces.push(piece);
        });
        next[dateStr] = day;
        return next;
      });
      setStatusLine(`Added shift ${BOARD_DATA[si][0]} to ${dateStr}`);
    },
    [updateEntries]
  );

  const removePiece = useCallback(
    (dateStr: string, idx: number) => {
      updateEntries((prev) => {
        const day = prev[dateStr];
        if (!day) return prev;
        const pieces = [...day.pieces];
        pieces.splice(idx, 1);
        return { ...prev, [dateStr]: { ...day, pieces } };
      });
    },
    [updateEntries]
  );

  const clearSheetDay = useCallback(
    (dateStr: string) => {
      updateEntries((prev) => {
        const day = prev[dateStr];
        if (!day) return prev;
        return {
          ...prev,
          [dateStr]: {
            ...day,
            pieces: [],
            fromSheet: false,
            sheetPlat: 0,
            sheetPay: 0,
          },
        };
      });
    },
    [updateEntries]
  );

  const updateDayField = useCallback(
    (dateStr: string, field: DayFieldName, value: number | boolean) => {
      updateEntries((prev) => {
        const day = prev[dateStr] ? { ...prev[dateStr] } : newEmptyDayEntry();
        if (
          field === "isSunday" ||
          field === "isStat" ||
          field === "dayOff"
        ) {
          day[field] = value as boolean;
        } else {
          day[field] = value as number;
        }
        return { ...prev, [dateStr]: day };
      });
    },
    [updateEntries]
  );

  const updateSpare = useCallback(
    (dateStr: string, spare: SpareInfo | null) => {
      updateEntries((prev) => {
        const day = prev[dateStr] ? { ...prev[dateStr] } : newEmptyDayEntry();
        day.spare = spare;
        return { ...prev, [dateStr]: day };
      });
    },
    [updateEntries]
  );

  const saveSettings = useCallback(async (next: PaySettings) => {
    setSettings(next);
    try {
      await store.saveSettings(next);
      setStatusLine("Pay rules saved");
    } catch {
      setStatusLine("Could not save rules");
    }
  }, []);

  const updatePayPeriodAnchor = useCallback(
    (dateStr: string) => {
      setSettings((prev) => {
        if (prev.payPeriodAnchor === dateStr) return prev;
        const next = { ...prev, payPeriodAnchor: dateStr };
        store.saveSettings(next).catch(() => {});
        return next;
      });
    },
    []
  );

  const periodDays = getPayPeriodDatesFor(refDate, settings);
  const periodComputed = computeWeek(entries, periodDays, settings);

  const start = periodDays[0];
  const end = periodDays[13];
  const periodLabel =
    start.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " – " +
    end.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const currentPeriodValue = fmtDate(start);
  const periodOptions = Array.from({ length: 30 }, (_, i) => {
    const offset = i - 15;
    const optStart = new Date(start);
    optStart.setDate(optStart.getDate() + offset * 14);
    const optEnd = new Date(optStart);
    optEnd.setDate(optEnd.getDate() + 13);
    const label =
      optStart.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }) +
      " – " +
      optEnd.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    return { value: fmtDate(optStart), label };
  });

  return (
    <div id="app">
      <Header
        weekLabel={periodLabel}
        grossPay={periodComputed.grossPay}
        payHrs={periodComputed.sumPay / 60}
      />

      <WeekNav
        refDate={refDate}
        periodOptions={periodOptions}
        currentPeriodValue={currentPeriodValue}
        onPrevWeek={() => {
          const d = new Date(refDate);
          d.setDate(d.getDate() - 14);
          setRefDate(d);
        }}
        onNextWeek={() => {
          const d = new Date(refDate);
          d.setDate(d.getDate() + 14);
          setRefDate(d);
        }}
        onPickDate={(dateStr) => setRefDate(parseDateStr(dateStr))}
        onSelectPeriod={(dateStr) => setRefDate(parseDateStr(dateStr))}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
      />

      {settingsOpen && (
        <SettingsPanel settings={settings} onSave={saveSettings} />
      )}

      <MonthCalendar
        entries={entries}
        settings={settings}
        onAddShift={addShiftToDate}
        onRemovePiece={removePiece}
        onClearSheetDay={clearSheetDay}
        onUpdateDayField={updateDayField}
        onUpdateSpare={updateSpare}
      />

      <BookingSheetImport
        onImport={updateEntries}
        onSeasonAnchorDetected={updatePayPeriodAnchor}
      />

      <RunSearch periodDays={periodDays} onAddShift={addShiftToDate} />

      <section className="summary panel">
        <h2>Pay Period Summary ({periodLabel})</h2>
        <SummaryTable week={periodComputed} settings={settings} />
      </section>

      <footer className="status">{statusLine}</footer>
    </div>
  );
}
