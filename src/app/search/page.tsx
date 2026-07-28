"use client";

import { useAppState } from "@/lib/AppStateContext";
import PaddleSearch from "@/components/PaddleSearch";
import RunSearch from "@/components/RunSearch";

export default function SearchPage() {
  const { periodDays, addShiftToDate } = useAppState();

  return (
    <>
      <PaddleSearch />
      <RunSearch periodDays={periodDays} onAddShift={addShiftToDate} />
    </>
  );
}
