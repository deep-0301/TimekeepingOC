import { fmtHM, fmtMoney } from "@/lib/dateUtils";
import type { PaySettings, WeekComputed } from "@/lib/types";

interface SummaryTableProps {
  week: WeekComputed;
  settings: PaySettings;
}

export default function SummaryTable({ week, settings }: SummaryTableProps) {
  const rows: [string, string][] = [
    ["Regular Pay", `${week.regularHrs.toFixed(2)} h  →  ${fmtMoney(week.regularPay)}`],
    [
      "CLC Break Paid (included above)",
      fmtHM(Math.max(0, week.sumPay - week.sumPlat)),
    ],
    [
      `Overtime Time & Half (×${settings.otMultiplier})`,
      `${week.otHrs.toFixed(2)} h  →  ${fmtMoney(week.otPay)}`,
    ],
    [
      "Non-Platform",
      `${(week.sumNonPlat / 60).toFixed(2)} h  →  ${fmtMoney(week.nonPlatPay)}`,
    ],
    [
      "Callup",
      `${(week.sumCallup / 60).toFixed(2)} h  →  ${fmtMoney(week.callupPay)}`,
    ],
    [
      "Booking Hours",
      `${(week.sumBooking / 60).toFixed(2)} h  →  ${fmtMoney(week.bookingPay)}`,
    ],
    [
      `Sunday Premium (+${((settings.sundayMultiplier - 1) * 100).toFixed(
        0
      )}% of base, on top of Regular)`,
      `${week.sundayHrs.toFixed(2)} h  →  ${fmtMoney(week.sundayPay)}`,
    ],
    [
      "Stat Holiday Paid",
      `${week.statDays} day(s)  →  ${fmtMoney(week.statPay)}`,
    ],
  ];

  return (
    <table className="summary-table">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{value}</td>
          </tr>
        ))}
        <tr className="total">
          <td>Gross pay</td>
          <td>{fmtMoney(week.grossPay)}</td>
        </tr>
      </tbody>
    </table>
  );
}
