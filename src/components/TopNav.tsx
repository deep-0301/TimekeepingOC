"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const LINKS = [
  { href: "/", label: "Calendar", icon: "📅" },
  { href: "/import", label: "Import Sheets", icon: "📥" },
  { href: "/search", label: "Find a Paddle", icon: "🔎" },
  { href: "/summary", label: "Pay Summary", icon: "💵" },
  { href: "/biweekly", label: "Biweekly Hours", icon: "🗓️" },
  { href: "/hos", label: "Hours of Service", icon: "⏱️" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

export default function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const current = LINKS.find((l) => isActive(l.href));

  // Tapping a link closes the drawer itself; this covers the back button,
  // which would otherwise change the page behind an open drawer.
  useEffect(() => {
    const onPop = () => setOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // While the drawer is over the page, the page itself must not scroll, and
  // Escape should get you out of it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <nav className="top-nav">
        <button
          type="button"
          className="nav-toggle"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen(true)}
        >
          <span className="nav-toggle-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="nav-toggle-current">
            {current ? current.label : "Menu"}
          </span>
        </button>

        <div
          id="main-nav"
          className={"nav-links" + (open ? " is-open" : "")}
          role="navigation"
        >
          <div className="nav-drawer-head">
            <span className="nav-drawer-title">Menu</span>
            <button
              type="button"
              className="ghost small"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              Close
            </button>
          </div>

          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                "top-nav-link" + (isActive(link.href) ? " top-nav-link-active" : "")
              }
              onClick={() => setOpen(false)}
            >
              <span className="nav-link-icon" aria-hidden="true">
                {link.icon}
              </span>
              {link.label}
            </Link>
          ))}

          <div className="spacer" />
          <button
            className="ghost small nav-signout"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </nav>

      {open && (
        <div
          className="nav-scrim"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
