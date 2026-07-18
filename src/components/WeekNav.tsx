import { fmtDate } from "@/lib/dateUtils";

export interface PeriodOption {
  value: string;
  label: string;
}

interface WeekNavProps {
  refDate: Date;
  periodOptions: PeriodOption[];
  currentPeriodValue: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onPickDate: (dateStr: string) => void;
  onSelectPeriod: (dateStr: string) => void;
  onToggleSettings: () => void;
}

export default function WeekNav({
  refDate,
  periodOptions,
  currentPeriodValue,
  onPrevWeek,
  onNextWeek,
  onPickDate,
  onSelectPeriod,
  onToggleSettings,
}: WeekNavProps) {
  return (
    <nav className="week-nav">
      <button className="ghost" onClick={onPrevWeek}>
        ◀ Prev period
      </button>
      <input
        type="date"
        value={fmtDate(refDate)}
        onChange={(e) => e.target.value && onPickDate(e.target.value)}
      />
      <select
        className="period-select"
        value={currentPeriodValue}
        onChange={(e) => e.target.value && onSelectPeriod(e.target.value)}
      >
        {periodOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button className="ghost" onClick={onNextWeek}>
        Next period ▶
      </button>
      <div className="spacer" />
      <button className="ghost" onClick={onToggleSettings}>
        ⚙ Pay rules
      </button>
    </nav>
  );
}
