"use client";

import { useMemo, useState } from "react";
import {
  BOARD_DATA,
  boardForDate,
  getShiftsForRun,
  searchRuns,
  shiftEndpoints,
  shortLocation,
} from "@/lib/board";
import { computeDay } from "@/lib/pay";
import { fmtHM, minToHHMM, parseDateStr, toMin } from "@/lib/dateUtils";
import { getHolidayForDate } from "@/lib/statHolidays";
import type {
  DayFieldName,
  DayFieldValue,
  EntriesMap,
  BusSighting,
  SpareInfo,
} from "@/lib/types";
import TimeField24 from "./TimeField24";
import GarageField from "./GarageField";
import InfoNote from "./InfoNote";
import DayPaddleView from "./DayPaddleView";
import DayBusView from "./DayBusView";
import DayExchange from "./DayExchange";
import { hosBreachFor } from "@/lib/hosFlags";
import { HOS_LIMITS } from "@/lib/hos";
import ChoicePicker, { type Choice } from "./ChoicePicker";
import {
  Alarm,
  ArrowRightAlt,
  CheckCircle,
  ChevronRight,
  DirectionsBus,
  Event,
  ExpandMore,
  HourglassEmpty,
  MoreTime,
  Traffic,
  Tune,
  Weekend,
} from "./icons";

/**
 * What became of a day that was already booked.
 *
 * The same three answers wherever the question is asked - a booked driving
 * day, or a spare that got dispatched - so they are written once.
 */
const BOOKED_ACTIONS: readonly Choice<"" | "late" | "dayoff">[] = [
  { value: "", label: "As scheduled", Icon: CheckCircle, hint: "Worked as scheduled" },
  { value: "late", label: "Late", Icon: Alarm, hint: "Arrived late" },
  { value: "dayoff", label: "Day off", Icon: Weekend, hint: "Took the day off" },
];

/** Why the day ran past its scheduled finish. */
const LATE_REASONS: readonly Choice<"" | "traffic_weather" | "extended">[] = [
  { value: "", label: "Not said", Icon: HourglassEmpty, hint: "No reason given yet" },
  { value: "traffic_weather", label: "Traffic", Icon: Traffic, hint: "Traffic or weather" },
  { value: "extended", label: "Extended", Icon: MoreTime, hint: "Extended" },
];

/** AVLC rule: revised time = AVLC time + 5 minutes. */
const AVLC_BUMP_MIN = 5;

interface DayEditorProps {
  dateStr: string;
  entries: EntriesMap;
  onAddShift: (si: number, dateStr: string) => void;
  onClearSheetDay: (dateStr: string) => void;
  onRecordBus: (dateStr: string, paddleNumber: string, sighting: BusSighting) => void;
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
  onClearSheetDay,
  onRecordBus,
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
  // Recomputed with the day rather than memoised: it reaches a fortnight back
  // through `entries`, and `entries` is exactly what changes when the day is
  // edited, so a memo keyed on it would recompute anyway.
  const hos = hosBreachFor(dateStr, entries);

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
        <div className="day-editor-head-actions">
          {day && confirmDelete && (
            <>
              <span className="note" style={{ margin: 0 }}>
                Delete this whole day?
              </span>
              <button
                className="danger-solid small"
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
                Keep
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
            <Event /> {holiday.name}{" "}
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

      {hos && (
        <div className="hos-banner">
          <div className="hos-banner-head">
            <span className="hos-banner-tag">HOS</span>
            <span>
              {hos.breaches.length === 1
                ? "This day is past an hours-of-service limit."
                : `This day is past ${hos.breaches.length} hours-of-service limits.`}
            </span>
          </div>
          <ul className="hos-banner-list">
            {hos.breaches.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="hos-banner-detail">
            On duty <b>{fmtHM(hos.onDutyMin)}</b> · driving{" "}
            <b>{fmtHM(hos.drivingMin)}</b>
            {hos.firstOnMin != null && hos.lastOffMin != null && (
              <>
                {" "}
                · {minToHHMM(hos.firstOnMin % 1440)} to{" "}
                {minToHHMM(hos.lastOffMin % 1440)}
                {hos.lastOffMin >= 1440 && " next day"}
              </>
            )}
            {hos.restBeforeMin != null &&
              hos.restBeforeMin < HOS_LIMITS.consecutiveOffDuty && (
                <>
                  {" "}
                  · only <b>{fmtHM(hos.restBeforeMin)}</b> off since the day
                  before
                </>
              )}
            {hos.estimated && " · duty time estimated from the guarantee"}
          </div>
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
          <span className="day-location-arrow">
            <ArrowRightAlt />
          </span>
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
          <div className="piece-list-head">
            {pieces.length === 1 ? "1 piece worked" : `${pieces.length} pieces worked`}
          </div>
          {pieces.map((p, idx) => (
            <div className="piece-row" key={idx}>
              <div className="piece-head">
                <b className="piece-run">{p.run}</b>
                <span className="shift-tag">shift {p.shiftId}</span>
              </div>
              <div className="piece-leg">
                <span className="piece-point">
                  {shortLocation(p.onLoc)}{" "}
                  <span className="piece-time">{p.onTime}</span>
                </span>
                <span className="piece-arrow">
                  <ArrowRightAlt />
                </span>
                <span className="piece-point">
                  {shortLocation(p.offLoc)}{" "}
                  <span className="piece-time">{p.offTime}</span>
                </span>
              </div>
            </div>
          ))}
          <DayBusView
            dateStr={dateStr}
            runs={pieces.map((p) => p.run)}
            saved={day?.buses}
            onRecord={onRecordBus}
          />
          <DayPaddleView dateStr={dateStr} runs={pieces.map((p) => p.run)} />
          <DayExchange
            dateStr={dateStr}
            paddle={pieces[0]?.run ?? null}
            onTime={pieces[0]?.onTime ?? null}
            offTime={pieces[pieces.length - 1]?.offTime ?? null}
            garage={pieces[0]?.onLoc ?? null}
          />
        </div>
      )}

      <button
        type="button"
        className={"manage-work-toggle" + (manageOpen ? " open" : "")}
        onClick={() => setManageOpen((o) => !o)}
      >
        <span className="manage-work-icon">
          <Tune />
        </span>
        Manage work
        <span className="manage-work-caret">
          {manageOpen ? <ExpandMore /> : <ChevronRight />}
        </span>
      </button>

      {manageOpen && (
        <>
        {!isDayOff && !isSpare && (
        <div className="day-editor-extras">
          {dc.fromSheet && !isDayOff && (
            <>
              <ChoicePicker
                label="What happened?"
                value={bookedAction as "" | "late" | "dayoff"}
                choices={BOOKED_ACTIONS}
                onChange={handleBookedActionChange}
              />
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
                  <ChoicePicker
                    label="Reason"
                    value={(day?.lateReason || "") as "" | "traffic_weather" | "extended"}
                    choices={LATE_REASONS}
                    onChange={(v) => onUpdateDayField(dateStr, "lateReason", v)}
                  />
                </>
              )}
            </>
          )}
          {!dc.fromSheet && !isDayOff && !isSpare && (
            <ChoicePicker
              label="What happened?"
              // Nothing has been said about this day yet, so "working" is where
              // it stands - and it is the one choice that needs no writing
              // down, since work is added below.
              value={"work" as const}
              choices={[
                {
                  value: "work",
                  label: "Working",
                  Icon: DirectionsBus,
                  hint: "Working — add the run below",
                },
                { value: "dayoff", label: "Day off", Icon: Weekend, hint: "Day off" },
                {
                  value: "spare",
                  label: "Spare",
                  Icon: HourglassEmpty,
                  hint: "Spare or standby",
                },
              ]}
              onChange={(v) => {
                if (v === "dayoff") {
                  onUpdateDayField(dateStr, "dayOff", true);
                } else if (v === "spare") {
                  onUpdateSpare(dateStr, { guaranteeHrs: 8, runNumber: null });
                }
              }}
            />
          )}
        </div>
        )}

        {isSpare && day?.spare && (
          <div className="spare-panel">
            <InfoNote label="How spare pay works">
              Spares are paid their guaranteed standby hours by default.
              If they get dispatched, add the run below - standby time from
              Reports to the run&apos;s actual start is calculated
              automatically, no need to log when standby ended. A report
              time of exactly 9:30, 12:30, 14:30, 16:30 or 18:30 always
              gets a 30-minute callup.
            </InfoNote>
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
              <ChoicePicker
                label="What happened?"
                value={day.spare.afternoonMode === "work" ? "work" : "standby"}
                choices={[
                  {
                    value: "standby",
                    label: "Standby",
                    Icon: HourglassEmpty,
                    hint: "Just standby, the whole day",
                  },
                  {
                    value: "work",
                    label: "Dispatched",
                    Icon: DirectionsBus,
                    hint: "Dispatched — add the paddle number",
                  },
                ]}
                onChange={(v) =>
                  patchSpare({ afternoonMode: v === "work" ? "work" : undefined })
                }
              />
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
                                ? "Selected"
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
                      <ChoicePicker
                        label="What happened?"
                        value={spareLateAction as "" | "late" | "dayoff"}
                        choices={BOOKED_ACTIONS}
                        onChange={handleSpareLateActionChange}
                      />
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
                        <ChoicePicker
                          label="Reason"
                          value={
                            (day?.lateReason || "") as
                              | ""
                              | "traffic_weather"
                              | "extended"
                          }
                          choices={LATE_REASONS}
                          onChange={(v) =>
                            onUpdateDayField(dateStr, "lateReason", v)
                          }
                        />
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
                      const [, totalPlat, totalPay, runs] = shift;
                      const { start, finish } = shiftEndpoints(shift);
                      return (
                        <div className="result-card" key={si}>
                          <div className="details">
                            <span className="shift-route">
                              {start} &rarr; {finish}
                            </span>
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
