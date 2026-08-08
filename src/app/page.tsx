"use client";

import Link from "next/link";
import { useAppState } from "@/lib/AppStateContext";
import MonthCalendar from "@/components/MonthCalendar";
import PanelHeading from "@/components/PanelHeading";

export default function Home() {
  const {
    entries,
    settings,
    addShiftToDate,
    clearSheetDay,
    recordBus,
    updateDayField,
    updateSpare,
    deleteDay,
  } = useAppState();

  const hasNoData = Object.keys(entries).length === 0;

  return (
    <>
      {hasNoData && (
        <section className="panel">
          <PanelHeading
            title="Get started"
            info={
              <>
            You haven&apos;t added any work yet.{" "}
            <Link href="/import">Import your booking sheets</Link>{" "}
            to load a whole season at once, or tap any date below to add a
            single day&apos;s work manually — a paddle number, a day off, or
            a spare/standby shift. You can also add manual work (without a
            booking sheet) from the{" "}
                <Link href="/import">Import Sheets</Link> page.
              </>
            }
          />
        </section>
      )}
      <MonthCalendar
        entries={entries}
        settings={settings}
        onAddShift={addShiftToDate}
        onClearSheetDay={clearSheetDay}
        onRecordBus={recordBus}
        onUpdateDayField={updateDayField}
        onUpdateSpare={updateSpare}
        onDeleteDay={deleteDay}
      />
    </>
  );
}
