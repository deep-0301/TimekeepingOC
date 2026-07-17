"use client";

import { useMemo, useState } from "react";
import { computeDay } from "@/lib/pay";
import { fmtDate } from "@/lib/dateUtils";
import type { DayFieldName, EntriesMap, PaySettings } from "@/lib/types";
import DayEditor from "./DayEditor";

interface MonthCalendarProps {
  entries: EntriesMap;
  settings: PaySettings;
  onAddShift: (si: number, dateStr: string) => void;
  onRemovePiece: (dateStr: string, idx: number) => void;
  onClearSheetDay: (dateStr: string) => void;
  onUpdateDayField: (
    dateStr: string,
    field: DayFieldName,
    value: number | boolean
  ) => void;
}

const WEEKDAY_LABELS_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LABELS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function MonthCalendar({
  entries,
  settings,
  onAddShift,
  onRemovePiece,
  onClearSheetDay,
  onUpdateDayField,
}: MonthCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const weekStartsMonday = settings.weekStart === "monday";
  const weekdayLabels = weekStartsMonday
    ? WEEKDAY_LABELS_MON
    : WEEKDAY_LABELS_SUN;

  const cells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const firstDow = firstOfMonth.getDay();
    const leadingOffset = weekStartsMonday
      ? firstDow === 0
        ? 6
        : firstDow - 1
      : firstDow;

    const start = new Date(year, month, 1 - leadingOffset);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [viewMonth, weekStartsMonday]);

  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <section className="panel">
      <h2>Calendar</h2>
      <div className="cal-nav">
        <button
          className="ghost small"
          onClick={() =>
            setViewMonth(
              new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
            )
          }
        >
          ◀
        </button>
        <span className="cal-month-label">{monthLabel}</span>
        <button
          className="ghost small"
          onClick={() =>
            setViewMonth(
              new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
            )
          }
        >
          ▶
        </button>
      </div>

      <div className="cal-grid">
        {weekdayLabels.map((label) => (
          <div className="cal-weekday" key={label}>
            {label}
          </div>
        ))}
        {cells.map((d) => {
          const dateStr = fmtDate(d);
          const inMonth = d.getMonth() === viewMonth.getMonth();
          const dc = computeDay(entries, dateStr);
          const runCodes = [
            ...new Set(dc.pieces.map((p) => p.run)),
          ];
          const isSelected = selectedDate === dateStr;
          return (
            <button
              key={dateStr}
              className={
                "cal-cell" +
                (inMonth ? "" : " cal-cell-out") +
                (dc.dayOff ? " cal-cell-dayoff" : "") +
                (isSelected ? " cal-cell-selected" : "")
              }
              onClick={() =>
                setSelectedDate((prev) => (prev === dateStr ? null : dateStr))
              }
            >
              <span className="cal-cell-date">{d.getDate()}</span>
              {dc.dayOff ? (
                <span className="cal-cell-off">OFF</span>
              ) : (
                <span className="cal-cell-runs">
                  {runCodes.slice(0, 3).map((r) => (
                    <span className="cal-run-chip" key={r}>
                      {r}
                    </span>
                  ))}
                  {runCodes.length > 3 && (
                    <span className="cal-run-chip">
                      +{runCodes.length - 3}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <DayEditor
          dateStr={selectedDate}
          entries={entries}
          onAddShift={onAddShift}
          onRemovePiece={onRemovePiece}
          onClearSheetDay={onClearSheetDay}
          onUpdateDayField={onUpdateDayField}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </section>
  );
}
