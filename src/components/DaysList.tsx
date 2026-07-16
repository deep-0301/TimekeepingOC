import { fmtDate } from "@/lib/dateUtils";
import type { EntriesMap, PaySettings } from "@/lib/types";
import DayCard from "./DayCard";

interface DaysListProps {
  weekDays: Date[];
  entries: EntriesMap;
  settings: PaySettings;
  onRemovePiece: (dateStr: string, idx: number) => void;
  onClearSheetDay: (dateStr: string) => void;
  onUpdateDayField: (
    dateStr: string,
    field: "nonPlatform" | "callup" | "booking" | "isSunday" | "isStat",
    value: number | boolean
  ) => void;
}

export default function DaysList({
  weekDays,
  entries,
  settings,
  onRemovePiece,
  onClearSheetDay,
  onUpdateDayField,
}: DaysListProps) {
  return (
    <section className="days">
      {weekDays.map((d) => (
        <DayCard
          key={fmtDate(d)}
          date={d}
          entries={entries}
          settings={settings}
          onRemovePiece={onRemovePiece}
          onClearSheetDay={onClearSheetDay}
          onUpdateDayField={onUpdateDayField}
        />
      ))}
    </section>
  );
}
