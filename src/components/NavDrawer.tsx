"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { NAV_LINKS, isActiveHref } from "@/lib/nav";
import { Close, Logout } from "./icons";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * The phone navigation drawer.
 *
 * This is rendered as the last thing on the page, after the page content,
 * and that placement is the whole point: paint order follows document order,
 * so nothing above it can come out on top. Two earlier attempts leaned on
 * z-index instead and both failed on iOS Safari - once with the scrim eating
 * every tap, once with the calendar showing straight through the open menu,
 * because the wrapper was `display: contents` and Safari skips such a box
 * when working out stacking. Keep it last, and keep every ancestor a plain
 * block.
 */
export default function NavDrawer({ open, onClose }: Props) {
  const pathname = usePathname();

  // Tapping a link closes the drawer itself; this covers the back button,
  // which would otherwise change the page behind an open drawer.
  useEffect(() => {
    window.addEventListener("popstate", onClose);
    return () => window.removeEventListener("popstate", onClose);
  }, [onClose]);

  // While the drawer is over the page, the page itself must not scroll, and
  // Escape should get you out of it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Turning a phone sideways can take the viewport past the breakpoint,
    // which hides the drawer by CSS alone. Closing on resize stops the scroll
    // lock outliving the thing that set it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose]);

  return (
    <div className={"nav-overlay" + (open ? " is-open" : "")}>
      {/* Scrim first, drawer second, so the drawer paints above it. */}
      <div className="nav-scrim" onClick={onClose} aria-hidden="true" />

      <div id="main-nav" className="nav-links" role="navigation">
        <div className="nav-drawer-head">
          <span className="nav-drawer-title">Menu</span>
          <button
            type="button"
            className="ghost small"
            onClick={onClose}
            aria-label="Close menu"
          >
            <Close />
          </button>
        </div>

        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              "top-nav-link" +
              (isActiveHref(link.href, pathname) ? " top-nav-link-active" : "")
            }
            onClick={onClose}
          >
            <span className="nav-link-icon" aria-hidden="true">
              <link.Icon />
            </span>
            {link.label}
          </Link>
        ))}

        {/* Only the drawer shows this; on a wide screen Sign out sits in the
            header, clear of the links. */}
        <div className="spacer" />
        <button
          className="ghost small nav-signout"
          onClick={() => supabase.auth.signOut()}
        >
          <Logout />
          Sign out
        </button>
      </div>
    </div>
  );
}
