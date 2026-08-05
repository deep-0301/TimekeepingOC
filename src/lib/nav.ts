/** The site's navigation, shared by the wide-screen bar and the phone drawer. */

import type { ComponentType } from "react";
import {
  AttachMoney,
  DateRange,
  DirectionsBus,
  Event,
  FileUpload,
  Person,
  Schedule,
  Search,
} from "@/components/icons";

export interface NavLink {
  href: string;
  label: string;
  /** Shown in the drawer only; the bar is text alone. */
  Icon: ComponentType<{ size?: number; className?: string }>;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Calendar", Icon: Event },
  { href: "/import", label: "Import Sheets", Icon: FileUpload },
  { href: "/search", label: "Find a Paddle", Icon: Search },
  { href: "/bus", label: "Find a Bus", Icon: DirectionsBus },
  { href: "/summary", label: "Pay Summary", Icon: AttachMoney },
  { href: "/biweekly", label: "Biweekly Hours", Icon: DateRange },
  { href: "/hos", label: "Hours of Service", Icon: Schedule },
  { href: "/profile", label: "Profile", Icon: Person },
];

export function isActiveHref(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
