"use client";

import { parseDateStr } from "@/lib/dateUtils";
import { useAppState } from "@/lib/AppStateContext";
import GrossPaySign from "@/components/GrossPaySign";
import WeekNav from "@/components/WeekNav";
import SummaryTable from "@/components/SummaryTable";
import SettingsPanel from "@/components/SettingsPanel";

export default function SummaryPage() {
  const {
    settings,
    saveSettings,
    settingsOpen,
    setSettingsOpen,
    refDate,
    setRefDate,
    periodComputed,
    periodLabel,
    currentPeriodValue,
    periodOptions,
  } = useAppState();

  return (
    <>
      <GrossPaySign
        weekLabel={periodLabel}
        grossPay={periodComputed.grossPay}
        payHrs={periodComputed.sumPay / 60}
      />

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
          <h2>Pay Period Summary ({periodLabel})</h2>
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
          <button className="ghost" onClick={() => setSettingsOpen((v) => !v)}>
            ⚙ Pay rules
          </button>
        </div>
        <SummaryTable week={periodComputed} settings={settings} />
      </section>

      {settingsOpen && (
        <SettingsPanel settings={settings} onSave={saveSettings} />
      )}
    </>
  );
}
