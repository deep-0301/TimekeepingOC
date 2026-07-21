"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Calendar" },
  { href: "/import", label: "Import Sheets" },
  { href: "/search", label: "Find a Run" },
  { href: "/summary", label: "Pay Summary" },
];

export default function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="top-nav">
      {LINKS.map((link) => {
        const isActive =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={"top-nav-link" + (isActive ? " top-nav-link-active" : "")}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
