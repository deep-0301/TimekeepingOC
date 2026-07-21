"use client";

import { useAppState } from "@/lib/AppStateContext";
import RunSearch from "@/components/RunSearch";

export default function SearchPage() {
  const { periodDays, addShiftToDate } = useAppState();

  return <RunSearch periodDays={periodDays} onAddShift={addShiftToDate} />;
}
