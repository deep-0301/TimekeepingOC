"use client";

import { useAppState } from "@/lib/AppStateContext";
import BookingSheetImport from "@/components/BookingSheetImport";
import ManualWorkEntry from "@/components/ManualWorkEntry";
import ClearAllData from "@/components/ClearAllData";

export default function ImportPage() {
  const {
    updateEntries,
    updatePayPeriodAnchor,
    addShiftToDate,
    updateSpare,
    updateDayField,
    clearAllEntries,
  } = useAppState();

  return (
    <>
      <BookingSheetImport
        onImport={updateEntries}
        onSeasonAnchorDetected={updatePayPeriodAnchor}
      />
      <ManualWorkEntry
        onAddShift={addShiftToDate}
        onUpdateSpare={updateSpare}
        onUpdateDayField={updateDayField}
      />
      <ClearAllData onClearAll={clearAllEntries} />
    </>
  );
}
