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

/** On a phone each row becomes a card, so a cell holding nothing is hidden
 * rather than taking up a line of its own. */
function Cell({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  const empty = value === "—";
  return (
    <td data-label={label} className={empty ? "is-empty" : undefined}>
      {bold && !empty ? <b>{value}</b> : value}
    </td>
  );
}

export default function BiweeklyTable({ week, entries }: BiweeklyTableProps) {
  return (
    <div className="biweekly-table-wrap">
      <table className="summary-table paystub-table biweekly-table stack-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Plat Hours</th>
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
            const platHoursMin = Math.max(0, dc.platMin - dc.dayOt);
            const clcMin = Math.max(0, dc.payMin - dc.platMin);
            const rowClass =
              (dc.isSunday ? " row-sunday" : "") +
              (dc.dayOff ? " row-dayoff" : "") +
              (dc.isStat ? " row-stat" : "");
            return (
              <tr key={dc.dateStr} className={rowClass.trim() || undefined}>
                <td className="biweekly-date stack-head" data-label="Date">
                  {dayLabel(date)}
                  {holiday && (
                    <span className="badge estimate" style={{ marginLeft: 6 }}>
                      {holiday.name}
                    </span>
                  )}
                </td>
                <td className="biweekly-type" data-label="Type">
                  {dayTypeLabel(dc, entries)}
                  {dc.isStat && <span className="badge match">stat</span>}
                  {dc.isSunday && <span className="badge estimate">sun</span>}
                </td>
                <Cell
                  label="Plat Hours"
                  value={platHoursMin > 0 ? fmtHM(platHoursMin) : "—"}
                />
                <Cell label="O/T" value={dc.dayOt > 0 ? fmtHM(dc.dayOt) : "—"} />
                <Cell
                  label="CLC Break"
                  value={clcMin > 0 ? fmtHM(clcMin) : "—"}
                />
                <Cell
                  label="Callup"
                  value={dc.callup > 0 ? fmtHM(dc.callup * 60) : "—"}
                />
                <Cell
                  label="Booking"
                  value={dc.booking > 0 ? fmtHM(dc.booking * 60) : "—"}
                />
                <Cell
                  label="Non-Plat"
                  value={dc.nonPlatform > 0 ? fmtHM(dc.nonPlatform * 60) : "—"}
                />
                <Cell
                  label="Total Hrs"
                  value={dc.payMin > 0 ? fmtHM(dc.payMin) : "—"}
                  bold
                />
              </tr>
            );
          })}
          <tr className="total">
            <td colSpan={2} className="stack-head">
              Total
            </td>
            <Cell label="Plat Hours" value={fmtHM(week.regularHrs * 60)} />
            <Cell label="O/T" value={fmtHM(week.otHrs * 60)} />
            <Cell label="CLC Break" value={fmtHM(week.clcBreakHrs * 60)} />
            <Cell label="Callup" value={fmtHM(week.sumCallup * 60)} />
            <Cell label="Booking" value={fmtHM(week.sumBooking * 60)} />
            <Cell label="Non-Plat" value={fmtHM(week.sumNonPlat * 60)} />
            <Cell label="Total Hrs" value={fmtHM(week.sumPay)} bold />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
