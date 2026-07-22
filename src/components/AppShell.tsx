"use client";

import { AppStateProvider, useAppState } from "@/lib/AppStateContext";
import Header from "@/components/Header";
import TopNav from "@/components/TopNav";

function Chrome({ children }: { children: React.ReactNode }) {
  const { statusLine } = useAppState();

  return (
    <div id="app">
      <Header />

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
