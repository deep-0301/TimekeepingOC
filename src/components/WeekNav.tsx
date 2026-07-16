import { fmtDate } from "@/lib/dateUtils";

interface WeekNavProps {
  refDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onPickDate: (dateStr: string) => void;
  onToggleSettings: () => void;
}

export default function WeekNav({
  refDate,
  onPrevWeek,
  onNextWeek,
  onPickDate,
  onToggleSettings,
}: WeekNavProps) {
  return (
    <nav className="week-nav">
      <button className="ghost" onClick={onPrevWeek}>
        ◀ Prev week
      </button>
      <input
        type="date"
        value={fmtDate(refDate)}
        onChange={(e) => e.target.value && onPickDate(e.target.value)}
      />
      <button className="ghost" onClick={onNextWeek}>
        Next week ▶
      </button>
      <div className="spacer" />
      <button className="ghost" onClick={onToggleSettings}>
        ⚙ Pay rules
      </button>
    </nav>
  );
}
