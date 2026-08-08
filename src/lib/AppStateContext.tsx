"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { BOARD_DATA, BOARD_SEGMENTS } from "@/lib/board";
import { fmtDate } from "@/lib/dateUtils";
import { computeWeek, getPayPeriodDatesFor } from "@/lib/pay";
import { store } from "@/lib/storage";
import {
  DEFAULT_SETTINGS,
  newEmptyDayEntry,
  type DayFieldName,
  type DayFieldValue,
  type EntriesMap,
  type EntryPiece,
  type PaySettings,
  mostSeen,
  seenCounts,
  type BusSighting,
  type SpareInfo,
  type WeekComputed,
} from "@/lib/types";

export interface PeriodOption {
  value: string;
  label: string;
}

interface AppState {
  settings: PaySettings;
  entries: EntriesMap;
  refDate: Date;
  setRefDate: (d: Date) => void;
  statusLine: string;
  settingsOpen: boolean;
  setSettingsOpen: (updater: boolean | ((prev: boolean) => boolean)) => void;
  addShiftToDate: (si: number, dateStr: string) => void;
  clearSheetDay: (dateStr: string) => void;
  recordBus: (dateStr: string, paddleNumber: string, sighting: BusSighting) => void;
  updateDayField: (
    dateStr: string,
    field: DayFieldName,
    value: DayFieldValue
  ) => void;
  updateSpare: (dateStr: string, spare: SpareInfo | null) => void;
  updateEntries: (updater: (prev: EntriesMap) => EntriesMap) => void;
  clearAllEntries: () => void;
  deleteDay: (dateStr: string) => void;
  saveSettings: (next: PaySettings) => Promise<void>;
  updatePayPeriodAnchor: (dateStr: string) => void;
  periodDays: Date[];
  periodComputed: WeekComputed;
  periodLabel: string;
  currentPeriodValue: string;
  periodOptions: PeriodOption[];
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
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
      const loaded = BOARD_SEGMENTS.filter((seg) => seg.count > 0).length;
      setStatusLine(
        `Ready · ${BOARD_DATA.length} shifts across ${loaded} boards`
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

  // Learned from the live feed rather than typed by anyone.
  //
  // Each sighting is counted and the bus kept is whichever has been seen
  // most, so an answer confirmed over a morning is not displaced by one odd
  // reading later. A report already counted changes nothing - opening the
  // day twice inside a refresh window returns the same position report, and
  // counting it again would turn a re-read into a confirmation.
  const recordBus = useCallback(
    (dateStr: string, paddleNumber: string, sighting: BusSighting) => {
      updateEntries((prev) => {
        const held = prev[dateStr]?.buses?.[paddleNumber];
        if (held?.lastAt != null && sighting.at <= held.lastAt) return prev;

        const seen = { ...seenCounts(held) };
        seen[sighting.fleet] = (seen[sighting.fleet] ?? 0) + 1;
        const fleet = mostSeen(seen, held?.fleet ?? sighting.fleet);

        const day = prev[dateStr] ? { ...prev[dateStr] } : newEmptyDayEntry();
        day.buses = {
          ...(day.buses || {}),
          [paddleNumber]: {
            fleet,
            // `at` belongs to the bus being kept, not to whatever was just
            // seen: it answers "when was this one last confirmed".
            at: fleet === sighting.fleet ? sighting.at : (held?.at ?? sighting.at),
            seen,
            lastAt: sighting.at,
          },
        };
        return { ...prev, [dateStr]: day };
      });
    },
    [updateEntries]
  );

  const updateDayField = useCallback(
    (dateStr: string, field: DayFieldName, value: DayFieldValue) => {
      updateEntries((prev) => {
        const day = prev[dateStr] ? { ...prev[dateStr] } : newEmptyDayEntry();
        if (field === "isStat" || field === "dayOff") {
          day[field] = value as boolean;
        } else if (field === "lateReason" || field === "dayOffType") {
          day[field] = (value || undefined) as unknown as never;
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

  const clearAllEntries = useCallback(() => {
    updateEntries(() => ({}));
    setStatusLine("Cleared — starting fresh");
  }, [updateEntries]);

  const deleteDay = useCallback(
    (dateStr: string) => {
      updateEntries((prev) => {
        if (!prev[dateStr]) return prev;
        const next = { ...prev };
        delete next[dateStr];
        return next;
      });
      setStatusLine(`Deleted ${dateStr}`);
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

  const updatePayPeriodAnchor = useCallback((dateStr: string) => {
    setSettings((prev) => {
      if (prev.payPeriodAnchor === dateStr) return prev;
      const next = { ...prev, payPeriodAnchor: dateStr };
      store.saveSettings(next).catch(() => {});
      return next;
    });
  }, []);

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

  const value: AppState = {
    settings,
    entries,
    refDate,
    setRefDate,
    statusLine,
    settingsOpen,
    setSettingsOpen,
    addShiftToDate,
    clearSheetDay,
    recordBus,
    updateDayField,
    updateSpare,
    updateEntries,
    clearAllEntries,
    deleteDay,
    saveSettings,
    updatePayPeriodAnchor,
    periodDays,
    periodComputed,
    periodLabel,
    currentPeriodValue,
    periodOptions,
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return ctx;
}
