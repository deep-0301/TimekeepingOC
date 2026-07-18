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
  const rows: PaystubRow[] = [
    {
      label: "Regular Pay",
      rate: fmtMoney(settings.baseRate),
      hrs: week.regularHrs.toFixed(2),
      earn: fmtMoney(week.regularPay),
    },
    {
      label: "Booking Hours",
      rate: fmtMoney(settings.baseRate),
      hrs: week.sumBooking.toFixed(2),
      earn: fmtMoney(week.bookingPay),
    },
    {
      label: "Non-Platform",
      rate: fmtMoney(settings.baseRate),
      hrs: week.sumNonPlat.toFixed(2),
      earn: fmtMoney(week.nonPlatPay),
    },
    {
      label: "CLC Break Paid",
      rate: fmtMoney(settings.baseRate),
      hrs: week.clcBreakHrs.toFixed(2),
      earn: fmtMoney(week.clcBreakPay),
    },
    {
      label: `Overtime Time & Half (×${settings.otMultiplier})`,
      rate: fmtMoney(settings.baseRate * settings.otMultiplier),
      hrs: week.otHrs.toFixed(2),
      earn: fmtMoney(week.otPay),
    },
    {
      label: "Callup",
      rate: fmtMoney(settings.baseRate),
      hrs: week.sumCallup.toFixed(2),
      earn: fmtMoney(week.callupPay),
    },
    {
      label: "AVLC",
      rate: fmtMoney(settings.baseRate),
      hrs: week.sumAvlc.toFixed(2),
      earn: fmtMoney(week.avlcPay),
    },
    {
      label: "Late Arrival Adjustment",
      rate: fmtMoney(settings.baseRate),
      hrs: week.sumLateArrival.toFixed(2),
      earn: fmtMoney(week.lateArrivalPay),
    },
    {
      label: `Sunday Premium (+${((settings.sundayMultiplier - 1) * 100).toFixed(0)}%)`,
      rate: fmtMoney(settings.baseRate * (settings.sundayMultiplier - 1)),
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
