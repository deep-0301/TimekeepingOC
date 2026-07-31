"use client";

import { useCallback, useState } from "react";
import { AppStateProvider, useAppState } from "@/lib/AppStateContext";
import AuthGate from "@/components/AuthGate";
import Header from "@/components/Header";
import NavDrawer from "@/components/NavDrawer";
import TopNav from "@/components/TopNav";

function Chrome({ children }: { children: React.ReactNode }) {
  const { statusLine } = useAppState();
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const openNav = useCallback(() => setNavOpen(true), []);

  return (
    <div id="app">
      <Header />

      <TopNav open={navOpen} onOpen={openNav} />

      {children}

      <footer className="status">{statusLine}</footer>

      {/* Last on the page on purpose: paint order follows document order, so
          nothing above can end up on top of an open drawer. */}
      <NavDrawer open={navOpen} onClose={closeNav} />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppStateProvider>
        <Chrome>{children}</Chrome>
      </AppStateProvider>
    </AuthGate>
  );
}
