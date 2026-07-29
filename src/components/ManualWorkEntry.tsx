"use client";

import { useMemo, useState } from "react";
import { boardForDate, getShiftsForRun } from "@/lib/board";
import { fmtDate, fmtHM, parseDateStr } from "@/lib/dateUtils";
import type { DayFieldName, DayFieldValue, SpareInfo } from "@/lib/types";
import TimeField24 from "./TimeField24";
import GarageField from "./GarageField";

type Frequency = "once" | "daily" | "weekly" | "biweekly";
type Mode = "run" | "spare" | "dayoff";

const FREQUENCY_STEP_DAYS: Record<Exclude<Frequency, "once">, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
};

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface ManualWorkEntryProps {
  onAddShift: (si: number, dateStr: string) => void;
  onUpdateSpare: (dateStr: string, spare: SpareInfo | null) => void;
  onUpdateDayField: (
    dateStr: string,
    field: DayFieldName,
    value: DayFieldValue
  ) => void;
}

export default function ManualWorkEntry({
  onAddShift,
  onUpdateSpare,
  onUpdateDayField,
}: ManualWorkEntryProps) {
  const [dateStr, setDateStr] = useState(() => fmtDate(new Date()));
  const [mode, setMode] = useState<Mode>("run");
  const [frequency, setFrequency] = useState<Frequency>("once");
  const [untilDateStr, setUntilDateStr] = useState("");
  // Days off in one cycle, keyed "<weekOfCycle>-<weekday>". A biweekly
  // booking commonly has several (e.g. Tuesday wk1 + Sun/Wed/Thu wk2).
  const [dayOffSlots, setDayOffSlots] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [garage, setGarage] = useState("");
  const [reportsMin, setReportsMin] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState("");

  const board = useMemo(() => boardForDate(dateStr), [dateStr]);
  const matches = query.trim()
    ? getShiftsForRun(query.trim(), dateStr)
    : [];

  const cycleWeeks = frequency === "biweekly" ? 2 : 1;

  function slotKey(week: number, weekday: number) {
    return `${week}-${weekday}`;
  }

  function toggleSlot(week: number, weekday: number) {
    setDayOffSlots((prev) => {
      const next = new Set(prev);
      const key = slotKey(week, weekday);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleFrequencyChange(next: Frequency) {
    setFrequency(next);
    // Repeating needs an end date - hand the user a sane starting range
    // (matching the start date) instead of leaving "Until" blank/stale.
    if (next !== "once" && (!untilDateStr || untilDateStr < dateStr)) {
      setUntilDateStr(dateStr);
    }
    // Dropping to a one-week cycle leaves any week-2 picks unreachable.
    if (next !== "biweekly") {
      setDayOffSlots(
        (prev) => new Set([...prev].filter((k) => k.startsWith("0-")))
      );
    }
  }

  function handleModeChange(next: Mode) {
    setMode(next);
    // A day off is anchored to a weekday, so a daily repeat is meaningless
    // there - fall back to the weekly cycle.
    if (next === "dayoff" && frequency === "daily") {
      handleFrequencyChange("weekly");
    }
  }

  function handleDateChange(next: string) {
    setDateStr(next);
    if (frequency !== "once" && (!untilDateStr || untilDateStr < next)) {
      setUntilDateStr(next);
    }
  }

  function computeDates(): string[] {
    if (frequency === "once" || !dateStr) return dateStr ? [dateStr] : [];
    if (!untilDateStr || untilDateStr < dateStr) return [];
    const step = FREQUENCY_STEP_DAYS[frequency];
    const start = parseDateStr(dateStr);
    const end = parseDateStr(untilDateStr);
    const dates: string[] = [];
    const d = new Date(start);
    while (d <= end) {
      dates.push(fmtDate(d));
      d.setDate(d.getDate() + step);
    }
    return dates;
  }

  /** Offset in days, from the start date, of each ticked day off within one
   * cycle. Week 1 of a slot is the first such weekday on or after the start
   * date; week 2 is seven days later. */
  function slotOffsets(startDow: number): number[] {
    return [...dayOffSlots]
      .map((key) => {
        const [week, weekday] = key.split("-").map(Number);
        return ((weekday - startDow + 7) % 7) + week * 7;
      })
      .sort((a, b) => a - b);
  }

  /** Every ticked day off falling in the range, repeating the whole cycle
   * (one or two weeks) until the end date. */
  function computeDayOffDates(): string[] {
    if (!dateStr || dayOffSlots.size === 0) return [];
    const start = parseDateStr(dateStr);
    const offsets = slotOffsets(start.getDay());

    const dateAt = (days: number) => {
      const d = new Date(start);
      d.setDate(d.getDate() + days);
      return d;
    };

    if (frequency === "once") {
      return offsets.map((o) => fmtDate(dateAt(o)));
    }
    if (!untilDateStr || untilDateStr < dateStr) return [];
    const step = FREQUENCY_STEP_DAYS[frequency];
    const end = parseDateStr(untilDateStr);
    const out: string[] = [];
    for (let base = 0; dateAt(base + offsets[0]) <= end; base += step) {
      offsets.forEach((o) => {
        const d = dateAt(base + o);
        if (d <= end) out.push(fmtDate(d));
      });
    }
    return [...new Set(out)].sort();
  }

  function handleSaveDayOff() {
    if (!dateStr) {
      setStatus("Pick a date first.");
      return;
    }
    if (dayOffSlots.size === 0) {
      setStatus("Tick at least one day off first.");
      return;
    }
    if (frequency !== "once" && (!untilDateStr || untilDateStr < dateStr)) {
      setStatus("Pick an end date on or after the start date.");
      return;
    }
    const dates = computeDayOffDates();
    if (dates.length === 0) {
      setStatus("None of those days fall in that date range.");
      return;
    }
    dates.forEach((d) => onUpdateDayField(d, "dayOff", true));
    setStatus(
      dates.length === 1
        ? `Marked ${dates[0]} as a day off.`
        : `Marked ${dates.length} days off (${dates[0]} through ${dates[dates.length - 1]}).`
    );
  }

  function handleAddRun(si: number, shiftId: string) {
    if (!dateStr) {
      setStatus("Pick a date first.");
      return;
    }
    if (frequency !== "once" && (!untilDateStr || untilDateStr < dateStr)) {
      setStatus("Pick an end date on or after the start date.");
      return;
    }
    const dates = computeDates();
    dates.forEach((d) => onAddShift(si, d));
    setStatus(
      dates.length === 1
        ? `Added shift ${shiftId} to ${dates[0]}.`
        : `Added shift ${shiftId} to ${dates.length} days (${dates[0]} through ${dates[dates.length - 1]}).`
    );
    setQuery("");
  }

  function handleSaveSpare() {
    if (!dateStr) {
      setStatus("Pick a date first.");
      return;
    }
    if (frequency !== "once" && (!untilDateStr || untilDateStr < dateStr)) {
      setStatus("Pick an end date on or after the start date.");
      return;
    }
    const dates = computeDates();
    dates.forEach((d) =>
      onUpdateSpare(d, {
        guaranteeHrs: 8,
        runNumber: null,
        startMin: reportsMin,
        garage: garage || undefined,
      })
    );
    setStatus(
      dates.length === 1
        ? `Spare day set up for ${dates[0]} — tap that date on the Calendar to finish the details (work on call or standby).`
        : `Spare day set up for ${dates.length} days (${dates[0]} through ${dates[dates.length - 1]}) — tap each date on the Calendar to finish the details (work on call or standby).`
    );
  }

  return (
    <section className="panel">
      <h2>Add work manually</h2>
      <div className="note">
        No booking sheet handy? Add a single day&apos;s work directly — a
        paddle number, a spare/standby shift, or a recurring day off.
      </div>
      <div className="day-editor-extras">
        <div className="field">
          <label>{frequency === "once" ? "Date" : "From"}</label>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => handleDateChange(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Type</label>
          <select
            value={mode}
            onChange={(e) => handleModeChange(e.target.value as Mode)}
          >
            <option value="run">Paddle number</option>
            <option value="spare">Spare / standby</option>
            <option value="dayoff">Day off</option>
          </select>
        </div>
        <div className="field">
          <label>Repeats</label>
          <select
            value={frequency}
            onChange={(e) => handleFrequencyChange(e.target.value as Frequency)}
          >
            <option value="once">Once</option>
            {mode !== "dayoff" && <option value="daily">Daily</option>}
            <option value="weekly">Every week</option>
            <option value="biweekly">Every 2 weeks</option>
          </select>
        </div>
        {frequency !== "once" && (
          <div className="field">
            <label>To</label>
            <input
              type="date"
              min={dateStr}
              value={untilDateStr}
              onChange={(e) => setUntilDateStr(e.target.value)}
            />
          </div>
        )}
      </div>

      {mode === "run" ? (
        <>
          <div className="note" style={{ marginBottom: 6 }}>
            Searching the{" "}
            <b>
              {board.season ? board.season.label : "—"} {board.dayType}
            </b>{" "}
            board (from the date above).
          </div>
          <input
            type="text"
            className="run-search"
            placeholder="Type a paddle number, e.g. 68-03"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() !== "" && (
            <div className="search-results">
              {matches.length === 0 ? (
                <div className="note">
                  {!board.season
                    ? "That date is outside the booking seasons loaded."
                    : board.empty
                      ? `No ${board.season.label} ${board.dayType} board has been loaded yet.`
                      : "No matching paddle number found."}
                </div>
              ) : (
                matches.map(({ si, shift }) => {
                  const [shiftId, totalPlat, totalPay, runs] = shift;
                  return (
                    <div className="result-card" key={si}>
                      <div className="details">
                        <span className="shift-tag">shift {shiftId}</span>
                        &nbsp; {runs.map((r) => r[0]).join(" + ")} &nbsp;
                        <b>{fmtHM(totalPlat)}</b> plat /{" "}
                        <b>{fmtHM(totalPay)}</b> pay
                      </div>
                      <button
                        className="small"
                        onClick={() => handleAddRun(si, shiftId)}
                      >
                        + Add
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      ) : mode === "spare" ? (
        <>
          <div className="day-editor-extras">
            <GarageField value={garage} onChange={setGarage} />
            <TimeField24
              label="Reports"
              valueMin={reportsMin}
              onCommit={setReportsMin}
            />
          </div>
          <button onClick={handleSaveSpare}>+ Set up spare day</button>
        </>
      ) : (
        <>
          <div className="note" style={{ marginBottom: 6 }}>
            Tick every day off in your{" "}
            {cycleWeeks === 2 ? "2-week (14 day) cycle" : "week (7 days)"} —
            there can be as many as your booking has (3, 4, 5, 6…).
            {cycleWeeks === 2 &&
              " Week 1 starts on the From date; week 2 is the week after."}
          </div>
          {Array.from({ length: cycleWeeks }, (_, week) => (
            <div key={week} className="dayoff-week">
              <span className="dayoff-week-label">
                {cycleWeeks === 2 ? `Week ${week + 1}` : ""}
              </span>
              {WEEKDAY_NAMES.map((name, weekday) => (
                <label key={weekday} className="dayoff-day">
                  <input
                    type="checkbox"
                    checked={dayOffSlots.has(slotKey(week, weekday))}
                    onChange={() => toggleSlot(week, weekday)}
                  />
                  {name.slice(0, 3)}
                </label>
              ))}
            </div>
          ))}
          <div className="note" style={{ marginBottom: 6 }}>
            {dayOffSlots.size === 0
              ? "No days off ticked yet."
              : `${dayOffSlots.size} day(s) off per ${
                  cycleWeeks === 2 ? "2-week cycle" : "week"
                }${
                  frequency === "once"
                    ? ", marked once."
                    : ", repeating until the To date."
                }`}
          </div>
          <button onClick={handleSaveDayOff}>+ Mark days off</button>
        </>
      )}

      {status && (
        <div className="note" style={{ marginTop: 8 }}>
          {status}
        </div>
      )}
    </section>
  );
}
