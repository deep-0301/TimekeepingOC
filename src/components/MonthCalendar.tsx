"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeDay } from "@/lib/pay";
import { fmtDate } from "@/lib/dateUtils";
import { getHolidayForDate } from "@/lib/statHolidays";
import type {
  DayFieldName,
  DayFieldValue,
  EntriesMap,
  PaySettings,
  RecordedBus,
  SpareInfo,
} from "@/lib/types";
import DayEditor from "./DayEditor";
import { ChevronLeft, ChevronRight } from "./icons";
import { hosBreaches } from "@/lib/hosFlags";

interface MonthCalendarProps {
  entries: EntriesMap;
  settings: PaySettings;
  onAddShift: (si: number, dateStr: string) => void;
  onClearSheetDay: (dateStr: string) => void;
  onRecordBus: (dateStr: string, paddleNumber: string, bus: RecordedBus) => void;
  onUpdateDayField: (
    dateStr: string,
    field: DayFieldName,
    value: DayFieldValue
  ) => void;
  onUpdateSpare: (dateStr: string, spare: SpareInfo | null) => void;
  onDeleteDay: (dateStr: string) => void;
}

const WEEKDAY_LABELS_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LABELS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function MonthCalendar({
  entries,
  settings,
  onAddShift,
  onClearSheetDay,
  onRecordBus,
  onUpdateDayField,
  onUpdateSpare,
  onDeleteDay,
}: MonthCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const editorRef = useRef<HTMLElement | null>(null);

  // On a phone the editor opens below the whole calendar, off-screen - bring
  // it into view so tapping a date visibly does something.
  useEffect(() => {
    if (!selectedDate) return;
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDate]);

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

  // Read once per render rather than per cell: 42 cells asking the clock the
  // same question is 42 chances for them to disagree across midnight.
  const todayStr = fmtDate(new Date());

  // Worked out for the whole grid at once. Each day's rolling totals reach a
  // fortnight back, so asking cell by cell would walk the same fortnight
  // forty-two times.
  const hosByDate = useMemo(
    () => hosBreaches(cells.map((d) => fmtDate(d)), entries),
    [cells, entries]
  );

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
          <ChevronLeft />
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
          <ChevronRight />
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
          const isToday = dateStr === todayStr;
          const hos = hosByDate.get(dateStr);
          const isWorking = !dc.dayOff && (dc.pieces.length > 0 || !!dc.spare);
          const dayOffType = entries[dateStr]?.dayOffType;
          const hasOvertime = dc.dayOff && dc.pieces.length > 0;
          const dots: string[] = [];
          if (dc.dayOff) {
            dots.push(
              dayOffType === "sick"
                ? "cal-dot-sick"
                : dayOffType === "legislative"
                ? "cal-dot-legislative"
                : "cal-dot-dayoff"
            );
          } else if (dc.spare) {
            dots.push("cal-dot-spare");
          } else if (isWorking) {
            dots.push("cal-dot-working");
          }
          return (
            <button
              key={dateStr}
              className={
                "cal-cell" +
                (inMonth ? "" : " cal-cell-out") +
                (holiday ? " cal-cell-holiday" : "") +
                (dc.dayOff ? " cal-cell-dayoff" : "") +
                (isWorking ? " cal-cell-working" : "") +
                (isToday ? " cal-cell-today" : "") +
                (isSelected ? " cal-cell-selected" : "")
              }
              aria-current={isToday ? "date" : undefined}
              title={
                holiday ? (isToday ? `Today - ${holiday.name}` : holiday.name)
                  : isToday ? "Today"
                  : undefined
              }
              onClick={() =>
                setSelectedDate((prev) => (prev === dateStr ? null : dateStr))
              }
            >
              <span className="cal-cell-date">{d.getDate()}</span>
              {hasOvertime && (
                <span className="cal-cell-ot" title="Overtime worked">
                  OT
                </span>
              )}
              {hos && (
                <span
                  className="cal-cell-hos"
                  title={`Hours of service: ${hos.breaches.join(", ")}`}
                >
                  HOS
                </span>
              )}
              {holiday && (
                <span className="cal-cell-holiday-label">{holiday.name}</span>
              )}
              {dc.dayOff && <span className="cal-cell-off">OFF</span>}
              {dots.length > 0 && (
                <span className="cal-dots">
                  {dots.map((d) => (
                    <span key={d} className={"cal-dot " + d} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="cal-legend-item">
          <span className="cal-legend-today">
            {new Date().getDate()}
          </span>{" "}
          Today
        </span>
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
          <span className="cal-cell-ot cal-legend-ot">OT</span> Overtime worked
        </span>
        <span className="cal-legend-item">
          <span className="cal-cell-hos cal-legend-ot">HOS</span> Past an
          hours-of-service limit
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-swatch cal-legend-holiday" /> Holiday
        </span>
      </div>
    </section>

    {selectedDate && (
      <section className="panel" ref={editorRef}>
        <h2>Day Details</h2>
        <DayEditor
          key={selectedDate}
          dateStr={selectedDate}
          entries={entries}
          onAddShift={onAddShift}
          onClearSheetDay={onClearSheetDay}
          onRecordBus={onRecordBus}
          onUpdateDayField={onUpdateDayField}
          onUpdateSpare={onUpdateSpare}
          onDeleteDay={onDeleteDay}
          onClose={() => setSelectedDate(null)}
        />
      </section>
    )}
    </>
  );
}
