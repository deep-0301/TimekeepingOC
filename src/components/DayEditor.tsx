"use client";

import { useMemo, useState } from "react";
import {
  BOARD_DATA,
  boardForDate,
  getShiftsForRun,
  searchRuns,
  shortLocation,
} from "@/lib/board";
import { computeDay } from "@/lib/pay";
import { fmtHM, minToHHMM, parseDateStr, toMin } from "@/lib/dateUtils";
import { getHolidayForDate } from "@/lib/statHolidays";
import type { DayFieldName, DayFieldValue, EntriesMap, SpareInfo } from "@/lib/types";
import TimeField24 from "./TimeField24";
import GarageField from "./GarageField";

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
  onDeleteDay: (dateStr: string) => void;
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
  onDeleteDay,
  onClose,
}: DayEditorProps) {
  const [query, setQuery] = useState("");
  const [spareRunInput, setSpareRunInput] = useState(
    entries[dateStr]?.spare?.runNumber || ""
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const day = entries[dateStr];
  const isDayOff = !!day?.dayOff;
  const isSpare = !!day?.spare;
  const dc = computeDay(entries, dateStr);
  const pieces = dc.pieces;
  const holiday = getHolidayForDate(parseDateStr(dateStr));

  const [bookedAction, setBookedAction] = useState(() =>
    day?.avlcMin || day?.revisedTimeMin ? "late" : ""
  );
  const [spareLateAction, setSpareLateAction] = useState(() =>
    day?.avlcMin || day?.revisedTimeMin ? "late" : ""
  );
  const [manageOpen, setManageOpen] = useState(false);

  const board = useMemo(() => boardForDate(dateStr), [dateStr]);

  const { results, truncated } = useMemo(
    () =>
      isSpare ? { results: [], truncated: false } : searchRuns(query, dateStr),
    [query, isSpare, dateStr]
  );

  const scheduledOffMin = dc.fromSheet
    ? (() => {
        const last = dc.pieces[dc.pieces.length - 1];
        return last ? toMin(last.offTime) : null;
      })()
    : null;

  const spareShiftMatches = spareRunInput
    ? getShiftsForRun(spareRunInput.trim(), dateStr)
    : [];
  const selectedShiftIndex =
    day?.spare?.runNumber === spareRunInput.trim()
      ? day.spare.shiftIndex ?? null
      : null;

  const spareShift =
    day?.spare?.shiftIndex != null ? BOARD_DATA[day.spare.shiftIndex] : undefined;
  const spareBoardOnMin = spareShift ? toMin(spareShift[3][0][1]) : undefined;
  const spareBoardOffMin = spareShift
    ? toMin(spareShift[3][spareShift[3].length - 1][2])
    : undefined;
  const spareScheduledOffMin =
    day?.spare?.workOffTimeOverride ?? spareBoardOffMin ?? null;

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

  function handleSpareLateActionChange(v: string) {
    setSpareLateAction(v);
    if (v === "dayoff") {
      onUpdateSpare(dateStr, null);
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {day && confirmDelete && (
            <>
              <span className="note" style={{ margin: 0 }}>
                Delete this day?
              </span>
              <button
                className="danger-solid"
                onClick={() => {
                  onDeleteDay(dateStr);
                  setConfirmDelete(false);
                  onClose();
                }}
              >
                Yes, delete
              </button>
              <button
                className="ghost small"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          )}
          {day && !confirmDelete && (
            <button
              className="ghost small"
              onClick={() => setConfirmDelete(true)}
            >
              Delete day
            </button>
          )}
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>
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
        Platform <b>{fmtHM(dc.platMin)}</b> · Pay <b>{fmtHM(dc.payMin)}</b>{" "}
        {dc.payMin > dc.platMin && (
          <>
            · CLC break paid <b>{fmtHM(dc.payMin - dc.platMin)}</b>{" "}
          </>
        )}
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

      {(!isSpare ||
        (!!day?.spare?.runNumber &&
          day?.spare?.workOnTimeOverride == null &&
          day?.spare?.workOffTimeOverride == null)) &&
        pieces.length > 0 && (
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
              {!dc.fromSheet && !isSpare && (
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
        {!isDayOff && !isSpare && (
        <div className="day-editor-extras">
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
          {!dc.fromSheet && !isDayOff && !isSpare && (
            <div className="field">
              <label>What happened?</label>
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "dayoff") {
                    onUpdateDayField(dateStr, "dayOff", true);
                  } else if (v === "spare") {
                    onUpdateSpare(dateStr, { guaranteeHrs: 8, runNumber: null });
                  }
                }}
              >
                <option value="">Working (add manually below)</option>
                <option value="dayoff">Day off</option>
                <option value="spare">Spare / standby</option>
              </select>
            </div>
          )}
        </div>
        )}

        {isSpare && day?.spare && (
          <div className="spare-panel">
            <div className="note">
              Spares are paid their guaranteed standby hours by default.
              If they get dispatched, add the run below - standby time from
              Reports to the run&apos;s actual start is calculated
              automatically, no need to log when standby ended. A report
              time of exactly 9:30, 12:30, 14:30, 16:30 or 18:30 always
              gets a 30-minute callup.
            </div>
            <div className="day-editor-extras">
              <GarageField
                value={day.spare.garage || ""}
                onChange={(v) => patchSpare({ garage: v })}
              />
              <TimeField24
                label="Reports"
                valueMin={day.spare.startMin}
                onCommit={(val) => patchSpare({ startMin: val })}
              />
            </div>

            <div className="day-editor-extras">
              <div className="field">
                <label>What happened?</label>
                <select
                  value={day.spare.afternoonMode || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    patchSpare({
                      afternoonMode: v === "" ? undefined : "work",
                    });
                  }}
                >
                  <option value="">Just standby (whole day)</option>
                  <option value="work">Paddle number (if dispatched)</option>
                </select>
              </div>
            </div>

            {day.spare.afternoonMode === "work" && (
              <>
                <div className="day-editor-extras">
                  <div className="field">
                    <label>Paddle number</label>
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
                        {board.empty
                          ? `No ${board.season ? board.season.label : ""} ${board.dayType} board has been loaded yet.`
                          : `No paddle "${spareRunInput}" found in the ${board.dayType} board — pay will use 0 platform time for it until a valid paddle number is picked.`}
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
                                  afternoonMode: "work",
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
                  <>
                    <div className="day-editor-extras">
                      <TimeField24
                        label="Actual start"
                        valueMin={
                          day.spare.workOnTimeOverride ??
                          day.spare.standbyEndMin ??
                          spareBoardOnMin
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

                    <div className="day-editor-extras">
                      <div className="field">
                        <label>What happened?</label>
                        <select
                          value={spareLateAction}
                          onChange={(e) =>
                            handleSpareLateActionChange(e.target.value)
                          }
                        >
                          <option value="">Working as scheduled</option>
                          <option value="late">Arrived late</option>
                          <option value="dayoff">Take a day off</option>
                        </select>
                      </div>
                    </div>
                    {spareLateAction === "late" && (
                      <>
                        <TimeField24
                          label="AVLC"
                          valueMin={day?.avlcMin}
                          minAllowed={
                            spareScheduledOffMin != null
                              ? spareScheduledOffMin + 1
                              : undefined
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
                            spareScheduledOffMin != null
                              ? spareScheduledOffMin + 1
                              : undefined
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
                              onUpdateDayField(
                                dateStr,
                                "lateReason",
                                e.target.value
                              )
                            }
                          >
                            <option value="">Choose a reason</option>
                            <option value="traffic_weather">
                              Traffic or weather
                            </option>
                            <option value="extended">Extended</option>
                          </select>
                        </div>
                      </>
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
            <div className="note" style={{ marginBottom: 6 }}>
              {board.season ? (
                <>
                  Searching the{" "}
                  <b>
                    {board.season.label} {board.dayType}
                  </b>{" "}
                  board.
                </>
              ) : (
                "That date is outside the booking seasons loaded."
              )}
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
                {results.length === 0 ? (
                  <div className="note">
                    {!board.season
                      ? "That date is outside the booking seasons loaded."
                      : board.empty
                        ? `No ${board.season.label} ${board.dayType} board has been loaded yet.`
                        : "No matching paddle number found."}
                  </div>
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
