"use client";

import { useMemo, useState } from "react";
import { BOARD_DATA, getShiftsForRun, searchRuns, shortLocation } from "@/lib/board";
import { computeDay, SPARE_AM_CUTOFF_MIN } from "@/lib/pay";
import { fmtHM, minToHHMM, parseDateStr, toMin } from "@/lib/dateUtils";
import { getHolidayForDate } from "@/lib/statHolidays";
import type { DayFieldName, DayFieldValue, EntriesMap, SpareInfo } from "@/lib/types";

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
    value: DayFieldValue
  ) => void;
  onUpdateSpare: (dateStr: string, spare: SpareInfo | null) => void;
  onClose: () => void;
}

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => i);

/** Always-24-hour clock-style time entry: separate hour/minute dropdowns
 * instead of typed text or a native <input type="time"> (whose displayed
 * format - 12h/AM-PM vs 24h - follows the visitor's own browser locale and
 * can't be reliably forced from the page). */
function TimeField24({
  label,
  valueMin,
  minAllowed,
  onCommit,
}: {
  label: string;
  valueMin: number | undefined;
  minAllowed?: number;
  onCommit: (min: number) => void;
}) {
  const hasValue = valueMin != null && valueMin > 0;
  const h = hasValue ? Math.floor(valueMin / 60) : "";
  const mi = hasValue ? valueMin % 60 : "";

  function commit(newH: number, newMi: number) {
    let mins = newH * 60 + newMi;
    if (minAllowed != null) mins = Math.max(mins, minAllowed);
    onCommit(mins);
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="time24">
        <span className="time24-icon">🕐</span>
        <select
          aria-label={`${label} hour`}
          value={h}
          onChange={(e) => commit(parseInt(e.target.value, 10), mi === "" ? 0 : mi)}
        >
          <option value="" disabled>
            HH
          </option>
          {HOURS_24.map((hh) => (
            <option key={hh} value={hh}>
              {String(hh).padStart(2, "0")}
            </option>
          ))}
        </select>
        <span className="time24-colon">:</span>
        <select
          aria-label={`${label} minute`}
          value={mi}
          onChange={(e) => commit(h === "" ? 0 : h, parseInt(e.target.value, 10))}
        >
          <option value="" disabled>
            MM
          </option>
          {MINUTES_60.map((mm) => (
            <option key={mm} value={mm}>
              {String(mm).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
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
  const pieces = dc.pieces;
  const holiday = getHolidayForDate(parseDateStr(dateStr));

  const [bookedAction, setBookedAction] = useState(() =>
    day?.avlcMin || day?.revisedTimeMin ? "late" : ""
  );
  const [manageOpen, setManageOpen] = useState(false);

  const { results, truncated } = useMemo(
    () => (isSpare ? { results: [], truncated: false } : searchRuns(query)),
    [query, isSpare]
  );

  const scheduledOffMin = dc.fromSheet
    ? (() => {
        const last = dc.pieces[dc.pieces.length - 1];
        return last ? toMin(last.offTime) : null;
      })()
    : null;

  const spareShiftMatches = spareRunInput
    ? getShiftsForRun(spareRunInput.trim())
    : [];
  const selectedShiftIndex =
    day?.spare?.runNumber === spareRunInput.trim()
      ? day.spare.shiftIndex ?? null
      : null;

  const isMorningSpare =
    day?.spare?.startMin == null || day.spare.startMin < SPARE_AM_CUTOFF_MIN;
  const spareShift =
    day?.spare?.shiftIndex != null ? BOARD_DATA[day.spare.shiftIndex] : undefined;
  const spareBoardOnMin = spareShift ? toMin(spareShift[3][0][1]) : undefined;
  const spareBoardOffMin = spareShift
    ? toMin(spareShift[3][spareShift[3].length - 1][2])
    : undefined;

  function patchSpare(patch: Partial<SpareInfo>) {
    const current: SpareInfo = day?.spare || {
      guaranteeHrs: 8,
      runNumber: null,
    };
    onUpdateSpare(dateStr, { ...current, ...patch });
  }

  function handleBookedActionChange(v: string) {
    setBookedAction(v);
    if (v === "dayoff") {
      onClearSheetDay(dateStr);
      onUpdateDayField(dateStr, "dayOff", true);
    } else if (v === "") {
      if (day?.avlcMin) onUpdateDayField(dateStr, "avlcMin", 0);
      if (day?.revisedTimeMin) onUpdateDayField(dateStr, "revisedTimeMin", 0);
      if (day?.lateReason) onUpdateDayField(dateStr, "lateReason", "");
    }
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

      {pieces.length > 0 && (
        <div className="day-location-line">
          <span className="day-location-point">
            {shortLocation(pieces[0].onLoc)}{" "}
            <span className="day-location-time">{pieces[0].onTime}</span>
          </span>
          <span className="day-location-arrow">→</span>
          <span className="day-location-point">
            {shortLocation(pieces[pieces.length - 1].offLoc)}{" "}
            <span className="day-location-time">
              {pieces[pieces.length - 1].offTime}
            </span>
          </span>
        </div>
      )}

      {isSpare &&
        day?.spare &&
        (day.spare.garage || day.spare.startMin != null) && (
          <div className="day-location-line">
            {day.spare.garage && (
              <span className="day-location-point">{day.spare.garage}</span>
            )}
            {day.spare.startMin != null && (
              <span className="day-location-point">
                Reports{" "}
                <span className="day-location-time">
                  {minToHHMM(day.spare.startMin)}
                </span>
              </span>
            )}
          </div>
        )}

      {!isSpare && pieces.length > 0 && (
        <div className="day-editor-pieces">
          {pieces.map((p, idx) => (
            <div className="piece-row" key={idx}>
              <span>
                <b>{p.run}</b> &nbsp;
                <span className="shift-tag">shift {p.shiftId}</span> &nbsp;
                {p.onTime}&rarr;{p.offTime} &nbsp;
                <span className="shift-tag">
                  {shortLocation(p.onLoc)}&rarr;{shortLocation(p.offLoc)}
                </span>
              </span>
              {!dc.fromSheet && (
                <button
                  className="danger"
                  title="Remove"
                  onClick={() => onRemovePiece(dateStr, idx)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className={"manage-work-toggle" + (manageOpen ? " open" : "")}
        onClick={() => setManageOpen((o) => !o)}
      >
        <span className="manage-work-caret">{manageOpen ? "▾" : "▸"}</span>
        Manage work
      </button>

      {manageOpen && (
        <>
        {!isDayOff && (
        <div className="day-editor-extras">
          {isSpare && (
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
          )}
          {dc.fromSheet && !isDayOff && (
            <>
              <div className="field">
                <label>What happened?</label>
                <select
                  value={bookedAction}
                  onChange={(e) => handleBookedActionChange(e.target.value)}
                >
                  <option value="">Working as scheduled</option>
                  <option value="late">Arrived late</option>
                  <option value="dayoff">Take a day off</option>
                </select>
              </div>
              {bookedAction === "late" && (
                <>
                  <TimeField24
                    label="AVLC"
                    valueMin={day?.avlcMin}
                    minAllowed={
                      scheduledOffMin != null ? scheduledOffMin + 1 : undefined
                    }
                    onCommit={(val) => {
                      onUpdateDayField(dateStr, "avlcMin", val);
                      onUpdateDayField(
                        dateStr,
                        "revisedTimeMin",
                        val ? val + AVLC_BUMP_MIN : 0
                      );
                    }}
                  />
                  <TimeField24
                    label="Revised time (counts as platform)"
                    valueMin={day?.revisedTimeMin}
                    minAllowed={
                      scheduledOffMin != null ? scheduledOffMin + 1 : undefined
                    }
                    onCommit={(val) =>
                      onUpdateDayField(dateStr, "revisedTimeMin", val)
                    }
                  />
                  <div className="field">
                    <label>Reason</label>
                    <select
                      value={day?.lateReason || ""}
                      onChange={(e) =>
                        onUpdateDayField(dateStr, "lateReason", e.target.value)
                      }
                    >
                      <option value="">Choose a reason</option>
                      <option value="traffic_weather">Traffic or weather</option>
                      <option value="extended">Extended</option>
                    </select>
                  </div>
                </>
              )}
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
        )}

        {isSpare && day?.spare && (
          <div className="spare-panel">
            <div className="note">
              {isMorningSpare
                ? "Morning spares (reporting before 9:30) are paid the flat standby hours below."
                : "Reporting at/after 9:30 — record whether this spare stood by all day or was dispatched to a run. A spare reporting at exactly 9:30, 12:30, 14:30, 16:30 or 18:30 always gets a 30-minute callup."}
            </div>
            <div className="day-editor-extras">
              <div className="field">
                <label>Garage</label>
                <input
                  type="text"
                  value={day.spare.garage || ""}
                  placeholder="e.g. Pinecrest"
                  onChange={(e) => patchSpare({ garage: e.target.value })}
                />
              </div>
              <TimeField24
                label="Reports"
                valueMin={day.spare.startMin}
                onCommit={(val) => patchSpare({ startMin: val })}
              />
            </div>

            {isMorningSpare && (
              <div className="day-editor-extras">
                <div className="field">
                  <label>Standby hours</label>
                  <input
                    type="number"
                    step="0.25"
                    value={day.spare.guaranteeHrs}
                    onChange={(e) =>
                      patchSpare({
                        guaranteeHrs: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
            )}

            {!isMorningSpare && (
              <>
                <div className="day-editor-extras">
                  <div className="field">
                    <label>What happened?</label>
                    <select
                      value={day.spare.afternoonMode || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        patchSpare({
                          afternoonMode: v === "" ? undefined : (v as "work" | "standby"),
                        });
                      }}
                    >
                      <option value="">Choose one</option>
                      <option value="work">Work on call</option>
                      <option value="standby">Standby (not dispatched)</option>
                    </select>
                  </div>
                </div>

                {day.spare.afternoonMode === "standby" && (
                  <div className="day-editor-extras">
                    <TimeField24
                      label="Standby until"
                      valueMin={day.spare.standbyEndMin}
                      onCommit={(val) => patchSpare({ standbyEndMin: val })}
                    />
                  </div>
                )}

                {day.spare.afternoonMode === "work" && (
                  <>
                    <div className="day-editor-extras">
                      <div className="field">
                        <label>Run number</label>
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
                    </div>
                    {spareRunInput.trim() !== "" && (
                      <div className="search-results">
                        {spareShiftMatches.length === 0 ? (
                          <div className="note">
                            No run &ldquo;{spareRunInput}&rdquo; found in the
                            loaded board — pay will use 0 platform time for it
                            until a valid run number is picked.
                          </div>
                        ) : (
                          spareShiftMatches.map(({ si, shift }) => {
                            const [shiftId, totalPlat, totalPay, runs] = shift;
                            return (
                              <div className="result-card" key={si}>
                                <div className="details">
                                  <span className="shift-tag">
                                    shift {shiftId}
                                  </span>
                                  &nbsp; {runs.length} piece(s) &nbsp; total{" "}
                                  <b>{fmtHM(totalPlat)}</b> plat /{" "}
                                  <b>{fmtHM(totalPay)}</b> pay
                                  {runs.map((r, idx) => (
                                    <div key={idx}>
                                      &bull; {r[0]} &nbsp; {r[1]}&rarr;{r[2]}{" "}
                                      &nbsp;
                                      {shortLocation(r[3])}&rarr;
                                      {shortLocation(r[4])}
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
                    {day.spare.runNumber && (
                      <div className="day-editor-extras">
                        <TimeField24
                          label="Actual start"
                          valueMin={
                            day.spare.workOnTimeOverride ?? spareBoardOnMin
                          }
                          onCommit={(val) =>
                            patchSpare({ workOnTimeOverride: val })
                          }
                        />
                        <TimeField24
                          label="Actual finish"
                          valueMin={
                            day.spare.workOffTimeOverride ?? spareBoardOffMin
                          }
                          onCommit={(val) =>
                            patchSpare({ workOffTimeOverride: val })
                          }
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {!isSpare && (!dc.fromSheet || isDayOff) && (
          <>
            {isDayOff && (
              <div className="note" style={{ marginBottom: 6 }}>
                Add overtime shift / manual run details worked on this day off:
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
                            {isDayOff ? "+ Add overtime shift" : "+ Add"}
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
        </>
      )}
    </div>
  );
}
