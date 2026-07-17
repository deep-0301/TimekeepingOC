"use client";

import { useMemo, useState } from "react";
import { searchRuns } from "@/lib/board";
import { fmtHM } from "@/lib/dateUtils";
import type { EntriesMap } from "@/lib/types";

interface DayEditorProps {
  dateStr: string;
  entries: EntriesMap;
  onAddShift: (si: number, dateStr: string) => void;
  onRemovePiece: (dateStr: string, idx: number) => void;
  onClearSheetDay: (dateStr: string) => void;
  onToggleDayOff: (dateStr: string, value: boolean) => void;
  onClose: () => void;
}

export default function DayEditor({
  dateStr,
  entries,
  onAddShift,
  onRemovePiece,
  onClearSheetDay,
  onToggleDayOff,
  onClose,
}: DayEditorProps) {
  const [query, setQuery] = useState("");
  const day = entries[dateStr];
  const isDayOff = !!day?.dayOff;
  const pieces = isDayOff ? [] : day?.pieces ?? [];

  const { results, truncated } = useMemo(
    () => (isDayOff ? { results: [], truncated: false } : searchRuns(query)),
    [query, isDayOff]
  );

  return (
    <div className="day-editor">
      <div className="day-editor-head">
        <strong>{dateStr}</strong>
        <button className="ghost small" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="toggle-row" style={{ margin: "8px 0" }}>
        <input
          type="checkbox"
          checked={isDayOff}
          onChange={(e) => onToggleDayOff(dateStr, e.target.checked)}
        />
        <label>Day off</label>
      </div>

      {!isDayOff && (
        <>
          {pieces.length > 0 && (
            <div className="day-editor-pieces">
              {pieces.map((p, idx) => (
                <div className="piece-row" key={idx}>
                  <span>
                    {p.run} &nbsp; {p.onTime}&rarr;{p.offTime} &nbsp;{" "}
                    <span className="shift-tag">shift {p.shiftId}</span>
                  </span>
                  <button
                    className="danger"
                    title="Remove"
                    onClick={() =>
                      day?.fromSheet
                        ? onClearSheetDay(dateStr)
                        : onRemovePiece(dateStr, idx)
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            type="text"
            className="run-search"
            placeholder="Type a run number, e.g. 68-03"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() !== "" && (
            <div className="search-results">
              {results.length === 0 ? (
                <div className="note">No matching run number found.</div>
              ) : (
                <>
                  {results.map(({ si, shift }) => {
                    const [shiftId, totalPlat, totalPay, runs] = shift;
                    return (
                      <div className="result-card" key={si}>
                        <div className="details">
                          <span className="shift-tag">shift {shiftId}</span>
                          &nbsp; {runs.map((r) => r[0]).join(" + ")} &nbsp;
                          <b>{fmtHM(totalPlat)}</b> plat / <b>{fmtHM(totalPay)}</b>{" "}
                          pay
                        </div>
                        <button
                          className="small"
                          onClick={() => {
                            onAddShift(si, dateStr);
                            setQuery("");
                          }}
                        >
                          + Add
                        </button>
                      </div>
                    );
                  })}
                  {truncated && (
                    <div className="note">
                      Showing the first 60 matches — narrow your search for
                      more.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
