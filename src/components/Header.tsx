import { fmtMoney } from "@/lib/dateUtils";

interface HeaderProps {
  weekLabel: string;
  grossPay: number;
  payHrs: number;
}

export default function Header({ weekLabel, grossPay, payHrs }: HeaderProps) {
  return (
    <header className="hero">
      <div className="brand">
        <span className="eyebrow">Run Sheet · ATU279 Timesheet</span>
        <h1>Run Number Timesheet</h1>
      </div>
      <div className="destination-sign">
        <div className="sign-label">Gross pay — period {weekLabel}</div>
        <div className="sign-amount">{fmtMoney(grossPay)}</div>
        <div className="sign-sub">{payHrs.toFixed(2)} pay hrs</div>
      </div>
    </header>
  );
}
