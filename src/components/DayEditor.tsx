"use client";

import { useMemo, useState } from "react";
import { getShiftsForRun, searchRuns, shortLocation } from "@/lib/board";
import { computeDay } from "@/lib/pay";
import { fmtHM, minToHHMM, parseDateStr, toMin } from "@/lib/dateUtils";
import { getHolidayForDate } from "@/lib/statHolidays";
import type { DayFieldName, EntriesMap, SpareInfo } from "@/lib/types";

/** AVLC rule: revised time = AVLC time + 5 minutes. */
const AVLC_BUMP_MIN = 5;

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
  onUpdateSpare: (dateStr: string, spare: SpareInfo | null) => void;
  onClose: () => void;
}

export default function DayEditor({
  dateStr,
  entries,
  onAddShift,
  onRemovePiece,
  onClearSheetDay,
  onUpdateDayField,
  onUpdateSpare,
  onClose,
}: DayEditorProps) {
  const [query, setQuery] = useState("");
  const [spareRunInput, setSpareRunInput] = useState(
    entries[dateStr]?.spare?.runNumber || ""
  );
  const day = entries[dateStr];
  const isDayOff = !!day?.dayOff;
  const isSpare = !!day?.spare;
  const dc = computeDay(entries, dateStr);
  const pieces = isDayOff ? [] : dc.pieces;
  const holiday = getHolidayForDate(parseDateStr(dateStr));

  const { results, truncated } = useMemo(
    () =>
      isDayOff || isSpare ? { results: [], truncated: false } : searchRuns(query),
    [query, isDayOff, isSpare]
  );

  const spareShiftMatches = spareRunInput
    ? getShiftsForRun(spareRunInput.trim())
    : [];
  const selectedShiftIndex =
    day?.spare?.runNumber === spareRunInput.trim()
      ? day.spare.shiftIndex ?? null
      : null;

  function patchSpare(patch: Partial<SpareInfo>) {
    const current: SpareInfo = day?.spare || {
      guaranteeHrs: 8,
      standbyHrsUsed: 8,
      runNumber: null,
    };
    onUpdateSpare(dateStr, { ...current, ...patch });
  }

  return (
    <div className={"day-editor" + (isDayOff ? " is-dayoff" : "")}>
      <div className="day-editor-head">
        <strong>{dateStr}</strong>
        <button className="ghost small" onClick={onClose}>
          Close
        </button>
      </div>

      {holiday && (
        <div className="holiday-banner">
          <span>
            📅 {holiday.name}{" "}
            <span className="badge estimate">
              {holiday.category === "general" ? "statutory" : "designated"}
            </span>
          </span>
          {!day?.isStat && (
            <button
              className="small"
              onClick={() => onUpdateDayField(dateStr, "isStat", true)}
            >
              Mark as stat holiday
            </button>
          )}
        </div>
      )}

      {!isDayOff && (
        <div className="day-stats" style={{ margin: "6px 0" }}>
          Plat <b>{fmtHM(dc.platMin)}</b> · Pay <b>{fmtHM(dc.payMin)}</b>{" "}
          {isSpare && <span className="badge estimate">spare</span>}
          {!isSpare &&
            pieces.length > 0 &&
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
        {isSpare && (
          <>
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
                  onUpdateDayField(
                    dateStr,
                    "callup",
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>
          </>
        )}
        {dc.fromSheet && (
          <>
            <div className="field">
              <label>AVLC</label>
              <input
                type="time"
                value={day?.avlcMin != null ? minToHHMM(day.avlcMin) : ""}
                onChange={(e) => {
                  const val = e.target.value ? toMin(e.target.value) : 0;
                  onUpdateDayField(dateStr, "avlcMin", val);
                  onUpdateDayField(
                    dateStr,
                    "revisedTimeMin",
                    val ? val + AVLC_BUMP_MIN : 0
                  );
                }}
              />
            </div>
            <div className="field">
              <label>Revised time (counts as platform)</label>
              <input
                type="time"
                value={
                  day?.revisedTimeMin != null
                    ? minToHHMM(day.revisedTimeMin)
                    : ""
                }
                onChange={(e) =>
                  onUpdateDayField(
                    dateStr,
                    "revisedTimeMin",
                    e.target.value ? toMin(e.target.value) : 0
                  )
                }
              />
            </div>
          </>
        )}
        {!isSpare && !dc.fromSheet && (
          <div className="field">
            <label>Booking hrs</label>
            <input
              type="number"
              step="0.25"
              value={day?.booking || ""}
              onChange={(e) =>
                onUpdateDayField(
                  dateStr,
                  "booking",
                  parseFloat(e.target.value) || 0
                )
              }
            />
          </div>
        )}
        {!dc.fromSheet && (
          <>
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
            <div className="field">
              <label>Spare / standby?</label>
              <div className="toggle-row">
                <input
                  type="checkbox"
                  checked={isSpare}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onUpdateSpare(dateStr, {
                        guaranteeHrs: 8,
                        standbyHrsUsed: 8,
                        runNumber: null,
                      });
                    } else {
                      setSpareRunInput("");
                      onUpdateSpare(dateStr, null);
                    }
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {isSpare && day?.spare && (
        <div className="spare-panel">
          <div className="note">
            Spares guarantee at least the platform hours below if never
            dispatched. Enter a run number if put to work — pay becomes
            standby hours used (if any) plus that run&apos;s platform time,
            plus a flat 30-minute callup.
          </div>
          <div className="day-editor-extras">
            <div className="field">
              <label>Guarantee (hrs)</label>
              <input
                type="number"
                step="0.25"
                value={day.spare.guaranteeHrs}
                onChange={(e) =>
                  patchSpare({ guaranteeHrs: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="field">
              <label>Run number (if dispatched)</label>
              <input
                type="text"
                value={spareRunInput}
                placeholder="e.g. 68-03"
                onChange={(e) => {
                  const v = e.target.value;
                  setSpareRunInput(v);
                  if (!v.trim()) {
                    patchSpare({ runNumber: null, shiftIndex: null });
                  }
                }}
              />
            </div>
            {day.spare.runNumber && (
              <div className="field">
                <label>Standby hrs used before the run</label>
                <input
                  type="number"
                  step="0.25"
                  value={day.spare.standbyHrsUsed}
                  onChange={(e) =>
                    patchSpare({
                      standbyHrsUsed: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            )}
          </div>
          {spareRunInput.trim() !== "" && (
            <div className="search-results">
              {spareShiftMatches.length === 0 ? (
                <div className="note">
                  No run &ldquo;{spareRunInput}&rdquo; found in the loaded
                  board — pay will use 0 platform time for it until a valid
                  run number is picked.
                </div>
              ) : (
                spareShiftMatches.map(({ si, shift }) => {
                  const [shiftId, totalPlat, totalPay, runs] = shift;
                  return (
                    <div className="result-card" key={si}>
                      <div className="details">
                        <span className="shift-tag">shift {shiftId}</span>
                        &nbsp; {runs.length} piece(s) &nbsp; total{" "}
                        <b>{fmtHM(totalPlat)}</b> plat / <b>{fmtHM(totalPay)}</b>{" "}
                        pay
                        {runs.map((r, idx) => (
                          <div key={idx}>
                            &bull; {r[0]} &nbsp; {r[1]}&rarr;{r[2]} &nbsp;{" "}
                            {shortLocation(r[3])}&rarr;{shortLocation(r[4])}
                          </div>
                        ))}
                      </div>
                      <button
                        className="small"
                        onClick={() =>
                          patchSpare({
                            runNumber: spareRunInput.trim(),
                            shiftIndex: si,
                          })
                        }
                      >
                        {selectedShiftIndex === si
                          ? "✓ Selected"
                          : "+ Add whole shift"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {!isDayOff && !isSpare && (
        <>
          {pieces.length > 0 && (
            <div className="day-editor-pieces">
              {pieces.map((p, idx) => (
                <div className="piece-row" key={idx}>
                  <span>
                    {p.run} &nbsp; {p.onTime}&rarr;{p.offTime} &nbsp;{" "}
                    <span className="shift-tag">
                      {shortLocation(p.onLoc)}&rarr;{shortLocation(p.offLoc)}
                    </span>
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
