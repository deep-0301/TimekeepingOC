"use client";

import { parseDateStr } from "@/lib/dateUtils";
import { AppStateProvider, useAppState } from "@/lib/AppStateContext";
import Header from "@/components/Header";
import WeekNav from "@/components/WeekNav";
import TopNav from "@/components/TopNav";

function Chrome({ children }: { children: React.ReactNode }) {
  const { refDate, setRefDate, statusLine, periodComputed, periodLabel } =
    useAppState();

  return (
    <div id="app">
      <Header
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

      <TopNav />

      {children}

      <footer className="status">{statusLine}</footer>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <Chrome>{children}</Chrome>
    </AppStateProvider>
  );
}
