"use client";

import { useState } from "react";
import { getShiftsForRun } from "@/lib/board";
import { fmtDate, fmtHM } from "@/lib/dateUtils";
import type { SpareInfo } from "@/lib/types";
import TimeField24 from "./TimeField24";
import GarageField from "./GarageField";

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
  const [query, setQuery] = useState("");
  const [garage, setGarage] = useState("");
  const [reportsMin, setReportsMin] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState("");

  const matches = query.trim() ? getShiftsForRun(query.trim()) : [];

  function handleAddRun(si: number, shiftId: string) {
    if (!dateStr) {
      setStatus("Pick a date first.");
      return;
    }
    onAddShift(si, dateStr);
    setStatus(`Added shift ${shiftId} to ${dateStr}.`);
    setQuery("");
  }

  function handleSaveSpare() {
    if (!dateStr) {
      setStatus("Pick a date first.");
      return;
    }
    onUpdateSpare(dateStr, {
      guaranteeHrs: 8,
      runNumber: null,
      startMin: reportsMin,
      garage: garage || undefined,
    });
    setStatus(
      `Spare day set up for ${dateStr} — tap that date on the Calendar to finish the details (work on call or standby).`
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
          <label>Date</label>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
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
      </div>

      {mode === "run" ? (
        <>
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
                <div className="note">No matching run number found.</div>
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
