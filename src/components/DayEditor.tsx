"use client";

import { useMemo, useState } from "react";
import { searchRuns } from "@/lib/board";
import { computeDay } from "@/lib/pay";
import { fmtHM } from "@/lib/dateUtils";
import type { DayFieldName, EntriesMap } from "@/lib/types";

interface DayEditorProps {
  dateStr: string;
  entries: EntriesMap;
  onAddShift: (si: number, dateStr: string) => void;
  onRemovePiece: (dateStr: string, idx: number) => void;
  onClearSheetDay: (dateStr: string) => void;
  onUpdateDayField: (
    dateStr: string,
    field: DayFieldName,
    value: number | boolean
  ) => void;
  onClose: () => void;
}

export default function DayEditor({
  dateStr,
  entries,
  onAddShift,
  onRemovePiece,
  onClearSheetDay,
  onUpdateDayField,
  onClose,
}: DayEditorProps) {
  const [query, setQuery] = useState("");
  const day = entries[dateStr];
  const isDayOff = !!day?.dayOff;
  const dc = computeDay(entries, dateStr);
  const pieces = isDayOff ? [] : dc.pieces;

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

      {!isDayOff && (
        <div className="day-stats" style={{ margin: "6px 0" }}>
          Plat <b>{fmtHM(dc.platMin)}</b> · Pay <b>{fmtHM(dc.payMin)}</b>{" "}
          {pieces.length > 0 &&
            (dc.fromSheet ? (
              <span className="badge match">from booking sheet</span>
            ) : dc.matched ? (
              <span className="badge match">board match</span>
            ) : (
              <span className="badge estimate">estimate</span>
            ))}
        </div>
      )}

      <div className="day-editor-extras">
        <div className="field">
          <label>Non-Platform (standby, hrs)</label>
          <input
            type="number"
            step="0.25"
            value={day?.nonPlatform || ""}
            onChange={(e) =>
              onUpdateDayField(
                dateStr,
                "nonPlatform",
                parseFloat(e.target.value) || 0
              )
            }
          />
        </div>
        <div className="field">
          <label>Callup (hrs)</label>
          <input
            type="number"
            step="0.25"
            value={day?.callup || ""}
            onChange={(e) =>
              onUpdateDayField(dateStr, "callup", parseFloat(e.target.value) || 0)
            }
          />
        </div>
        <div className="field">
          <label>Booking hrs</label>
          <input
            type="number"
            step="0.25"
            value={day?.booking || ""}
            onChange={(e) =>
              onUpdateDayField(dateStr, "booking", parseFloat(e.target.value) || 0)
            }
          />
        </div>
        <div className="field">
          <label>Sunday?</label>
          <div className="toggle-row">
            <input
              type="checkbox"
              checked={!!day?.isSunday}
              onChange={(e) =>
                onUpdateDayField(dateStr, "isSunday", e.target.checked)
              }
            />
          </div>
        </div>
        <div className="field">
          <label>Stat holiday?</label>
          <div className="toggle-row">
            <input
              type="checkbox"
              checked={!!day?.isStat}
              onChange={(e) =>
                onUpdateDayField(dateStr, "isStat", e.target.checked)
              }
            />
          </div>
        </div>
        <div className="field">
          <label>Day off?</label>
          <div className="toggle-row">
            <input
              type="checkbox"
              checked={isDayOff}
              onChange={(e) =>
                onUpdateDayField(dateStr, "dayOff", e.target.checked)
              }
            />
          </div>
        </div>
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
                      dc.fromSheet
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
