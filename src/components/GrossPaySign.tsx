import { fmtMoney } from "@/lib/dateUtils";

interface GrossPaySignProps {
  weekLabel: string;
  grossPay: number;
  payHrs: number;
}

export default function GrossPaySign({
  weekLabel,
  grossPay,
  payHrs,
}: GrossPaySignProps) {
  return (
    <div className="destination-sign">
      <div className="sign-label">Gross pay — period {weekLabel}</div>
      <div className="sign-amount">{fmtMoney(grossPay)}</div>
      <div className="sign-sub">{payHrs.toFixed(2)} pay hrs</div>
    </div>
  );
}
