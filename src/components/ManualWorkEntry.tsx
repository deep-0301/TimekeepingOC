"use client";

import { useMemo, useState } from "react";
import { dayTypeForDate, getShiftsForRun, WEEKEND_BOARD_LOADED } from "@/lib/board";
import { fmtDate, fmtHM, parseDateStr } from "@/lib/dateUtils";
import type { SpareInfo } from "@/lib/types";
import TimeField24 from "./TimeField24";
import GarageField from "./GarageField";

type Frequency = "once" | "daily" | "weekly" | "biweekly";

const FREQUENCY_STEP_DAYS: Record<Exclude<Frequency, "once">, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
};

interface ManualWorkEntryProps {
  onAddShift: (si: number, dateStr: string) => void;
  onUpdateSpare: (dateStr: string, spare: SpareInfo | null) => void;
}

export default function ManualWorkEntry({
  onAddShift,
  onUpdateSpare,
}: ManualWorkEntryProps) {
  const [dateStr, setDateStr] = useState(() => fmtDate(new Date()));
  const [mode, setMode] = useState<"run" | "spare">("run");
  const [frequency, setFrequency] = useState<Frequency>("once");
  const [untilDateStr, setUntilDateStr] = useState("");
  const [query, setQuery] = useState("");
  const [garage, setGarage] = useState("");
  const [reportsMin, setReportsMin] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState("");

  const dayType = useMemo(
    () => (dateStr ? dayTypeForDate(parseDateStr(dateStr)) : "weekday"),
    [dateStr]
  );
  const matches = query.trim()
    ? getShiftsForRun(query.trim(), dayType)
    : [];

  function handleFrequencyChange(next: Frequency) {
    setFrequency(next);
    // Repeating needs an end date - hand the user a sane starting range
    // (matching the start date) instead of leaving "Until" blank/stale.
    if (next !== "once" && (!untilDateStr || untilDateStr < dateStr)) {
      setUntilDateStr(dateStr);
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
        No booking sheet handy? Add a single day&apos;s work directly — a run
        number, or a spare/standby shift.
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
            onChange={(e) => setMode(e.target.value as "run" | "spare")}
          >
            <option value="run">Run number</option>
            <option value="spare">Spare / standby</option>
          </select>
        </div>
        <div className="field">
          <label>Repeats</label>
          <select
            value={frequency}
            onChange={(e) => handleFrequencyChange(e.target.value as Frequency)}
          >
            <option value="once">Once</option>
            <option value="daily">Daily</option>
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
            Searching the <b>{dayType === "weekend" ? "weekend" : "weekday"}</b>{" "}
            board (based on the date above).
          </div>
          <input
            type="text"
            className="run-search"
            placeholder="Type a run number, e.g. 68-03"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() !== "" && (
            <div className="search-results">
              {matches.length === 0 ? (
                <div className="note">
                  {dayType === "weekend" && !WEEKEND_BOARD_LOADED
                    ? "No weekend board has been loaded yet."
                    : "No matching run number found."}
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
      ) : (
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
      )}

      {status && (
        <div className="note" style={{ marginTop: 8 }}>
          {status}
        </div>
      )}
    </section>
  );
}
