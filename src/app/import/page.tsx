"use client";

import { useAppState } from "@/lib/AppStateContext";
import BookingSheetImport from "@/components/BookingSheetImport";

export default function ImportPage() {
  const { updateEntries, updatePayPeriodAnchor } = useAppState();

  return (
    <BookingSheetImport
      onImport={updateEntries}
      onSeasonAnchorDetected={updatePayPeriodAnchor}
    />
  );
}
