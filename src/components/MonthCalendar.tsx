"use client";

import { useMemo, useState } from "react";
import { computeDay } from "@/lib/pay";
import { fmtDate } from "@/lib/dateUtils";
import { getHolidayForDate } from "@/lib/statHolidays";
import type {
  DayFieldName,
  DayFieldValue,
  EntriesMap,
  PaySettings,
  SpareInfo,
} from "@/lib/types";
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
    value: DayFieldValue
  ) => void;
  onUpdateSpare: (dateStr: string, spare: SpareInfo | null) => void;
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
  onUpdateSpare,
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
    <>
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
          const holiday = getHolidayForDate(d);
          const isSelected = selectedDate === dateStr;
          const isWorking = !dc.dayOff && (dc.pieces.length > 0 || !!dc.spare);
          const dayOffType = entries[dateStr]?.dayOffType;
          const dotClass = dc.dayOff
            ? dayOffType === "sick"
              ? "cal-dot-sick"
              : dayOffType === "legislative"
              ? "cal-dot-legislative"
              : "cal-dot-dayoff"
            : dc.spare
            ? "cal-dot-spare"
            : isWorking
            ? "cal-dot-working"
            : "";
          return (
            <button
              key={dateStr}
              className={
                "cal-cell" +
                (inMonth ? "" : " cal-cell-out") +
                (holiday ? " cal-cell-holiday" : "") +
                (dc.dayOff ? " cal-cell-dayoff" : "") +
                (isWorking ? " cal-cell-working" : "") +
                (isSelected ? " cal-cell-selected" : "")
              }
              title={holiday ? holiday.name : undefined}
              onClick={() =>
                setSelectedDate((prev) => (prev === dateStr ? null : dateStr))
              }
            >
              <span className="cal-cell-date">{d.getDate()}</span>
              {holiday && (
                <span className="cal-cell-holiday-label">{holiday.name}</span>
              )}
              {dc.dayOff && <span className="cal-cell-off">OFF</span>}
              {dotClass && <span className={"cal-dot " + dotClass} />}
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="cal-legend-item">
          <span className="cal-dot cal-dot-working" /> Working
        </span>
        <span className="cal-legend-item">
          <span className="cal-dot cal-dot-spare" /> Spare / standby
        </span>
        <span className="cal-legend-item">
          <span className="cal-dot cal-dot-sick" /> Sick day
        </span>
        <span className="cal-legend-item">
          <span className="cal-dot cal-dot-legislative" /> Legislative day
        </span>
        <span className="cal-legend-item">
          <span className="cal-dot cal-dot-dayoff" /> Day off
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-swatch cal-legend-holiday" /> Holiday
        </span>
      </div>
    </section>

    {selectedDate && (
      <section className="panel">
        <h2>Day Details</h2>
        <DayEditor
          key={selectedDate}
          dateStr={selectedDate}
          entries={entries}
          onAddShift={onAddShift}
          onRemovePiece={onRemovePiece}
          onClearSheetDay={onClearSheetDay}
          onUpdateDayField={onUpdateDayField}
          onUpdateSpare={onUpdateSpare}
          onClose={() => setSelectedDate(null)}
        />
      </section>
    )}
    </>
  );
}
