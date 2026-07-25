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
    clearAllEntries,
  } = useAppState();

  return (
    <>
      <ManualWorkEntry onAddShift={addShiftToDate} onUpdateSpare={updateSpare} />
      <BookingSheetImport
        onImport={updateEntries}
        onSeasonAnchorDetected={updatePayPeriodAnchor}
      />
      <ClearAllData onClearAll={clearAllEntries} />
    </>
  );
}
