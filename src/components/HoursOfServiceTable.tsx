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
      <table className="summary-table paystub-table biweekly-table hos-table">
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
                <td className="biweekly-date">{dayLabel(parseDateStr(r.dateStr))}</td>
                <td className="biweekly-type">
                  {r.label}
                  {r.estimated && (
                    <span className="badge estimate">estimated</span>
                  )}
                </td>
                <td className={r.drivingMin > HOS_LIMITS.dailyDriving ? "hos-over" : undefined}>
                  {r.drivingMin > 0 ? fmtHM(r.drivingMin) : "—"}
                </td>
                <td>{r.otherOnDutyMin > 0 ? fmtHM(r.otherOnDutyMin) : "—"}</td>
                <td className={r.onDutyMin > HOS_LIMITS.dailyOnDuty ? "hos-over" : undefined}>
                  {r.onDutyMin > 0 ? <b>{fmtHM(r.onDutyMin)}</b> : "—"}
                </td>
                <td
                  className={
                    r.onDutyMin > 0 && r.offDutyMin < HOS_LIMITS.dailyOffDuty
                      ? "hos-over"
                      : undefined
                  }
                >
                  {fmtHM(r.offDutyMin)}
                </td>
                <td className={r.elapsedMin > HOS_LIMITS.elapsedWindow ? "hos-over" : undefined}>
                  {r.firstOnMin != null && r.lastOffMin != null ? (
                    <span title={`${minToHHMM(r.firstOnMin % 1440)} → ${minToHHMM(r.lastOffMin % 1440)}`}>
                      {fmtHM(r.elapsedMin)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
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
                <td>
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
