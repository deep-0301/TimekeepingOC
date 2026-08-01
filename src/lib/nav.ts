/** The site's navigation, shared by the wide-screen bar and the phone drawer. */

export interface NavLink {
  href: string;
  label: string;
  /** Shown in the drawer only; the bar is text alone. */
  icon: string;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Calendar", icon: "📅" },
  { href: "/import", label: "Import Sheets", icon: "📥" },
  { href: "/search", label: "Find a Paddle", icon: "🔎" },
  { href: "/bus", label: "Find a Bus", icon: "🚌" },
  { href: "/summary", label: "Pay Summary", icon: "💵" },
  { href: "/biweekly", label: "Biweekly Hours", icon: "🗓️" },
  { href: "/hos", label: "Hours of Service", icon: "⏱️" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

export function isActiveHref(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
