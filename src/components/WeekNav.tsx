import { fmtDate } from "@/lib/dateUtils";
import { ChevronLeft, ChevronRight } from "./icons";

interface WeekNavProps {
  refDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onPickDate: (dateStr: string) => void;
}

export default function WeekNav({
  refDate,
  onPrevWeek,
  onNextWeek,
  onPickDate,
}: WeekNavProps) {
  return (
    <nav className="week-nav">
      <button className="ghost" onClick={onPrevWeek}>
        <ChevronLeft />
        Prev period
      </button>
      <input
        type="date"
        value={fmtDate(refDate)}
        onChange={(e) => e.target.value && onPickDate(e.target.value)}
      />
      <button className="ghost" onClick={onNextWeek}>
        Next period
        <ChevronRight />
      </button>
    </nav>
  );
}
