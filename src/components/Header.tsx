"use client";

import { supabase } from "@/lib/supabaseClient";

export default function Header() {
  return (
    <header className="hero">
      <div className="brand">
        <span className="eyebrow">Run Sheet · ATU279 Timesheet</span>
        <h1>Run Number Timesheet</h1>
      </div>
      {/* On a phone this lives at the bottom of the nav drawer instead. */}
      <button
        className="ghost small header-signout"
        onClick={() => supabase.auth.signOut()}
      >
        Sign out
      </button>
    </header>
  );
}
