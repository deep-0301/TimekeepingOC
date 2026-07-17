import { computeDay } from "@/lib/pay";
import { dayLabel, fmtDate, fmtHM } from "@/lib/dateUtils";
import type { DayFieldName, EntriesMap, PaySettings } from "@/lib/types";

interface DayCardProps {
  date: Date;
  entries: EntriesMap;
  settings: PaySettings;
  onRemovePiece: (dateStr: string, idx: number) => void;
  onClearSheetDay: (dateStr: string) => void;
  onUpdateDayField: (
    dateStr: string,
    field: DayFieldName,
    value: number | boolean
  ) => void;
}

export default function DayCard({
  date,
  entries,
  settings,
  onRemovePiece,
  onClearSheetDay,
  onUpdateDayField,
}: DayCardProps) {
  const dateStr = fmtDate(date);
  const dc = computeDay(entries, dateStr);
  const dayEntry = entries[dateStr];
  const dailyOt = Math.max(0, dc.payMin - settings.otThreshold * 60);
  const isDayOff = !!dayEntry?.dayOff;

  return (
    <div
      className={
        "day-card" +
        (dailyOt > 0 ? " has-ot" : "") +
        (isDayOff ? " is-dayoff" : "")
      }
    >
      <div className="day-head">
        <span className="date-label">{dayLabel(date)}</span>
        <span className="day-stats">
          {isDayOff ? (
            <span className="badge dayoff">day off</span>
          ) : (
            <>
              Plat <b>{fmtHM(dc.platMin)}</b> · Pay <b>{fmtHM(dc.payMin)}</b>{" "}
              {dc.pieces.length > 0 &&
                (dc.fromSheet ? (
                  <span className="badge match">from booking sheet</span>
                ) : dc.matched ? (
                  <span className="badge match">board match</span>
                ) : (
                  <span className="badge estimate">estimate</span>
                ))}
            </>
          )}
        </span>
      </div>

      {!isDayOff && dc.pieces.map((p, idx) => (
        <div className="piece-row" key={idx}>
          <span>
            {p.run} &nbsp; {p.onTime}&rarr;{p.offTime} &nbsp; {p.onLoc}&rarr;
            {p.offLoc} &nbsp; {fmtHM(p.platMin)} plat &nbsp;{" "}
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

      <div className="day-extras">
        <div className="field">
          <label>Non-Platform (standby, hrs)</label>
          <input
            type="number"
            step="0.25"
            value={dayEntry?.nonPlatform || ""}
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
            value={dayEntry?.callup || ""}
            onChange={(e) =>
              onUpdateDayField(
                dateStr,
                "callup",
                parseFloat(e.target.value) || 0
              )
            }
          />
        </div>
        <div className="field">
          <label>Booking hrs</label>
          <input
            type="number"
            step="0.25"
            value={dayEntry?.booking || ""}
            onChange={(e) =>
              onUpdateDayField(
                dateStr,
                "booking",
                parseFloat(e.target.value) || 0
              )
            }
          />
        </div>
        <div className="field">
          <label>Sunday?</label>
          <div className="toggle-row">
            <input
              type="checkbox"
              checked={!!dayEntry?.isSunday}
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
              checked={!!dayEntry?.isStat}
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
    </div>
  );
}
