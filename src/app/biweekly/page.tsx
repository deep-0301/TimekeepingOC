"use client";

import { parseDateStr } from "@/lib/dateUtils";
import { useAppState } from "@/lib/AppStateContext";
import WeekNav from "@/components/WeekNav";
import BiweeklyTable from "@/components/BiweeklyTable";

export default function BiweeklyPage() {
  const {
    entries,
    refDate,
    setRefDate,
    periodComputed,
    periodLabel,
    currentPeriodValue,
    periodOptions,
  } = useAppState();

  return (
    <>
      <WeekNav
        refDate={refDate}
        onPrevWeek={() => {
          const d = new Date(refDate);
          d.setDate(d.getDate() - 14);
          setRefDate(d);
        }}
        onNextWeek={() => {
          const d = new Date(refDate);
          d.setDate(d.getDate() + 14);
          setRefDate(d);
        }}
        onPickDate={(dateStr) => setRefDate(parseDateStr(dateStr))}
      />

      <section className="summary panel">
        <div className="summary-head">
          <h2>Biweekly Hours ({periodLabel})</h2>
          <select
            className="period-select"
            value={currentPeriodValue}
            onChange={(e) =>
              e.target.value && setRefDate(parseDateStr(e.target.value))
            }
          >
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <BiweeklyTable week={periodComputed} entries={entries} />
        <div className="note">
          One row per day in the pay period, broken down by hour type.
          Totals at the bottom match the Pay Summary page.
        </div>
      </section>
    </>
  );
}
