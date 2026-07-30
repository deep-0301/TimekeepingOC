import { dayLabel, fmtHM, minToHHMM, parseDateStr } from "@/lib/dateUtils";
import { HOS_LIMITS, type HosCycle, type HosDayRow } from "@/lib/hos";

interface Props {
  rows: HosDayRow[];
  cycle: HosCycle;
}

/** How close a running total is to its cycle limit, as a percentage. */
function pct(min: number, limit: number): number {
  return Math.min(100, Math.round((min / limit) * 100));
}

export default function HoursOfServiceTable({ rows, cycle }: Props) {
  const cycleLimit =
    cycle === "cycle1" ? HOS_LIMITS.cycle1 : HOS_LIMITS.cycle2;

  return (
    <div className="biweekly-table-wrap">
      <table className="summary-table paystub-table biweekly-table hos-table stack-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Driving</th>
            <th>Other on duty</th>
            <th>On duty</th>
            <th>Off duty</th>
            <th>Elapsed</th>
            <th>{cycle === "cycle1" ? "7-day" : "14-day"}</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rolling =
              cycle === "cycle1" ? r.rolling7Min : r.rolling14Min;
            const over = r.breaches.length > 0;
            return (
              <tr
                key={r.dateStr}
                className={
                  (over ? "row-hos-breach" : "") +
                  (r.dayOff ? " row-dayoff" : "")
                }
              >
                <td className="biweekly-date stack-head" data-label="Date">
                  {dayLabel(parseDateStr(r.dateStr))}
                </td>
                <td className="biweekly-type" data-label="Type">
                  {r.label}
                  {r.estimated && (
                    <span className="badge estimate">estimated</span>
                  )}
                </td>
                <td
                  data-label="Driving"
                  className={
                    (r.drivingMin > HOS_LIMITS.dailyDriving ? "hos-over " : "") +
                    (r.drivingMin > 0 ? "" : "is-empty")
                  }
                >
                  {r.drivingMin > 0 ? fmtHM(r.drivingMin) : "—"}
                </td>
                <td
                  data-label="Other on duty"
                  className={r.otherOnDutyMin > 0 ? undefined : "is-empty"}
                >
                  {r.otherOnDutyMin > 0 ? fmtHM(r.otherOnDutyMin) : "—"}
                </td>
                <td
                  data-label="On duty"
                  className={
                    (r.onDutyMin > HOS_LIMITS.dailyOnDuty ? "hos-over " : "") +
                    (r.onDutyMin > 0 ? "" : "is-empty")
                  }
                >
                  {r.onDutyMin > 0 ? <b>{fmtHM(r.onDutyMin)}</b> : "—"}
                </td>
                <td
                  data-label="Off duty"
                  className={
                    r.onDutyMin > 0 && r.offDutyMin < HOS_LIMITS.dailyOffDuty
                      ? "hos-over"
                      : undefined
                  }
                >
                  {fmtHM(r.offDutyMin)}
                </td>
                <td
                  data-label="Elapsed"
                  className={
                    (r.elapsedMin > HOS_LIMITS.elapsedWindow ? "hos-over " : "") +
                    (r.firstOnMin != null ? "" : "is-empty")
                  }
                >
                  {r.firstOnMin != null && r.lastOffMin != null ? (
                    <span title={`${minToHHMM(r.firstOnMin % 1440)} → ${minToHHMM(r.lastOffMin % 1440)}`}>
                      {fmtHM(r.elapsedMin)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td data-label={cycle === "cycle1" ? "7-day total" : "14-day total"}>
                  <span className="hos-cycle-cell">
                    <span className={rolling > cycleLimit ? "hos-over" : undefined}>
                      {fmtHM(rolling)}
                    </span>
                    <span className="hos-bar" aria-hidden="true">
                      <span
                        className={
                          "hos-bar-fill" +
                          (rolling > cycleLimit
                            ? " is-over"
                            : pct(rolling, cycleLimit) >= 85
                              ? " is-close"
                              : "")
                        }
                        style={{ width: `${pct(rolling, cycleLimit)}%` }}
                      />
                    </span>
                  </span>
                </td>
                <td
                  data-label="Status"
                  className={over || r.onDutyMin > 0 ? undefined : "is-empty"}
                >
                  {over ? (
                    r.breaches.map((b) => (
                      <span className="badge badge-breach" key={b}>
                        {b}
                      </span>
                    ))
                  ) : r.onDutyMin > 0 ? (
                    <span className="badge match">ok</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
