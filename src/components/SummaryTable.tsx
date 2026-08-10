import { fmtMoney } from "@/lib/dateUtils";
import type { PaySettings, WeekComputed } from "@/lib/types";

interface SummaryTableProps {
  week: WeekComputed;
  settings: PaySettings;
}

interface PaystubRow {
  label: string;
  rate: string;
  hrs: string;
  earn: string;
}

export default function SummaryTable({ week, settings }: SummaryTableProps) {
  // The rate the period was actually paid at, which is not always the one
  // typed into the settings: an operator still stepping up is paid from the
  // date they started, and a raise can land part-way through a period. Where
  // two rates were used, the column says so rather than picking one.
  const rates = week.rates.length ? week.rates : [settings.baseRate];
  const rateCol = rates.map((r) => fmtMoney(r)).join(" → ");
  const otRateCol = rates
    .map((r) => fmtMoney(r * settings.otMultiplier))
    .join(" → ");
  const sundayRateCol = rates
    .map((r) => fmtMoney(r * (settings.sundayMultiplier - 1)))
    .join(" → ");

  const rows: PaystubRow[] = [
    {
      label: "Regular Pay",
      rate: rateCol,
      hrs: week.regularHrs.toFixed(2),
      earn: fmtMoney(week.regularPay),
    },
    {
      label: "Booking Hours",
      rate: rateCol,
      hrs: week.sumBooking.toFixed(2),
      earn: fmtMoney(week.bookingPay),
    },
    {
      label: "Non-Platform",
      rate: rateCol,
      hrs: week.sumNonPlat.toFixed(2),
      earn: fmtMoney(week.nonPlatPay),
    },
    {
      label: "CLC Break Paid",
      rate: rateCol,
      hrs: week.clcBreakHrs.toFixed(2),
      earn: fmtMoney(week.clcBreakPay),
    },
    {
      label: `Overtime Time & Half (×${settings.otMultiplier})`,
      rate: otRateCol,
      hrs: week.otHrs.toFixed(2),
      earn: fmtMoney(week.otPay),
    },
    {
      label: "Callup",
      rate: rateCol,
      hrs: week.sumCallup.toFixed(2),
      earn: fmtMoney(week.callupPay),
    },
    {
      label: `Sunday Premium (+${((settings.sundayMultiplier - 1) * 100).toFixed(0)}%)`,
      rate: sundayRateCol,
      hrs: week.sundayHrs.toFixed(2),
      earn: fmtMoney(week.sundayPay),
    },
    {
      label: "Stat Holiday Paid",
      rate: "—",
      hrs: `${week.statDays} day(s)`,
      earn: fmtMoney(week.statPay),
    },
  ];

  return (
    <table className="summary-table paystub-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Rate</th>
          <th>Hrs</th>
          <th>Earnings</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td>{r.rate}</td>
            <td>{r.hrs}</td>
            <td>{r.earn}</td>
          </tr>
        ))}
        <tr className="total">
          <td>Total</td>
          <td />
          <td>{week.totalHrs.toFixed(2)}</td>
          <td>{fmtMoney(week.grossPay)}</td>
        </tr>
      </tbody>
    </table>
  );
}
