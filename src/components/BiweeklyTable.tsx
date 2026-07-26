import { dayLabel, fmtHM, parseDateStr } from "@/lib/dateUtils";
import { getHolidayForDate } from "@/lib/statHolidays";
import type { EntriesMap, WeekComputed } from "@/lib/types";

interface BiweeklyTableProps {
  week: WeekComputed;
  entries: EntriesMap;
}

function dayTypeLabel(
  dc: WeekComputed["perDay"][number],
  entries: EntriesMap
): string {
  if (dc.dayOff) {
    const t = entries[dc.dateStr]?.dayOffType;
    return t === "sick" ? "Sick" : t === "legislative" ? "Legislative" : "Day off";
  }
  if (dc.spare) return "Spare";
  if (dc.pieces.length > 0) return "Working";
  return "—";
}

export default function BiweeklyTable({ week, entries }: BiweeklyTableProps) {
  return (
    <div className="biweekly-table-wrap">
      <table className="summary-table paystub-table biweekly-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Regular</th>
            <th>O/T</th>
            <th>CLC Break</th>
            <th>Callup</th>
            <th>Booking</th>
            <th>Non-Plat</th>
            <th>Total Hrs</th>
          </tr>
        </thead>
        <tbody>
          {week.perDay.map((dc) => {
            const date = parseDateStr(dc.dateStr);
            const holiday = getHolidayForDate(date);
            const regularMin = Math.max(0, dc.payMin - dc.dayOt);
            const clcMin = Math.max(0, dc.payMin - dc.platMin);
            const rowClass =
              (dc.isSunday ? " row-sunday" : "") +
              (dc.dayOff ? " row-dayoff" : "") +
              (dc.isStat ? " row-stat" : "");
            return (
              <tr key={dc.dateStr} className={rowClass.trim() || undefined}>
                <td className="biweekly-date">
                  {dayLabel(date)}
                  {holiday && (
                    <span className="badge estimate" style={{ marginLeft: 6 }}>
                      {holiday.name}
                    </span>
                  )}
                </td>
                <td className="biweekly-type">
                  {dayTypeLabel(dc, entries)}
                  {dc.isStat && <span className="badge match">stat</span>}
                  {dc.isSunday && <span className="badge estimate">sun</span>}
                </td>
                <td>{regularMin > 0 ? fmtHM(regularMin) : "—"}</td>
                <td>{dc.dayOt > 0 ? fmtHM(dc.dayOt) : "—"}</td>
                <td>{clcMin > 0 ? fmtHM(clcMin) : "—"}</td>
                <td>{dc.callup > 0 ? fmtHM(dc.callup * 60) : "—"}</td>
                <td>{dc.booking > 0 ? fmtHM(dc.booking * 60) : "—"}</td>
                <td>{dc.nonPlatform > 0 ? fmtHM(dc.nonPlatform * 60) : "—"}</td>
                <td>{dc.payMin > 0 ? fmtHM(dc.payMin) : "—"}</td>
              </tr>
            );
          })}
          <tr className="total">
            <td colSpan={2}>Total</td>
            <td>{fmtHM(week.regularHrs * 60)}</td>
            <td>{fmtHM(week.otHrs * 60)}</td>
            <td>{fmtHM(week.clcBreakHrs * 60)}</td>
            <td>{fmtHM(week.sumCallup * 60)}</td>
            <td>{fmtHM(week.sumBooking * 60)}</td>
            <td>{fmtHM(week.sumNonPlat * 60)}</td>
            <td>{fmtHM(week.sumPay)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
