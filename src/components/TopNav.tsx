"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, isActiveHref } from "@/lib/nav";

interface Props {
  open: boolean;
  onOpen: () => void;
}

/**
 * The nav bar: a row of links on a wide screen, or the button that opens the
 * drawer on a phone. The drawer itself is NavDrawer, rendered at the very
 * bottom of the page so that it paints over everything.
 */
export default function TopNav({ open, onOpen }: Props) {
  const pathname = usePathname();
  const current = NAV_LINKS.find((l) => isActiveHref(l.href, pathname));

  return (
    <nav className="top-nav">
      <button
        type="button"
        className="nav-toggle"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="main-nav"
        onClick={onOpen}
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

      <div className="nav-bar-links">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              "top-nav-link" +
              (isActiveHref(link.href, pathname) ? " top-nav-link-active" : "")
            }
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
