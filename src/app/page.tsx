"use client";

import { useAppState } from "@/lib/AppStateContext";
import MonthCalendar from "@/components/MonthCalendar";

export default function Home() {
  const {
    entries,
    settings,
    addShiftToDate,
    removePiece,
    clearSheetDay,
    updateDayField,
    updateSpare,
  } = useAppState();

  return (
    <MonthCalendar
      entries={entries}
      settings={settings}
      onAddShift={addShiftToDate}
      onRemovePiece={removePiece}
      onClearSheetDay={clearSheetDay}
      onUpdateDayField={updateDayField}
      onUpdateSpare={updateSpare}
    />
  );
}
