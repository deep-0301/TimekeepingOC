import type { ComponentType } from "react";
import { Event, WbSunny } from "@/components/icons";

import type { PaySettings } from "./types";

export type BookingType = NonNullable<PaySettings["bookingType"]>;

export interface BookingSheetSlotDef {
  key: string;
  title: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  accent: "steel" | "amber";
}

interface BookingTypeInfo {
  label: string;
  description: string;
  slots: BookingSheetSlotDef[];
}

export const BOOKING_TYPE_INFO: Record<BookingType, BookingTypeInfo> = {
  daily: {
    label: "Daily booking",
    description: "One booking sheet - your own daily assignment.",
    slots: [
      { key: "daily", title: "Booking sheet", Icon: Event, accent: "steel" },
    ],
  },
  general: {
    label: "General booking",
    description:
      "Covers a daily booking operator's days off - two sheets: a Mon-Fri sheet, and a Sat/Sun + stat holiday sheet.",
    slots: [
      {
        key: "weekday",
        title: "Weekday (Mon–Fri) sheet",
        Icon: Event,
        accent: "steel",
      },
      {
        key: "weekend",
        title: "Weekend / holiday sheet",
        Icon: WbSunny,
        accent: "amber",
      },
    ],
  },
  holiday: {
    label: "Holiday spare",
    description:
      "Two sheets: regular holiday work each week, and holiday stat work.",
    slots: [
      {
        key: "holidayRegular",
        title: "Regular holiday work sheet",
        Icon: Event,
        accent: "steel",
      },
      {
        key: "holidayStat",
        title: "Holiday stat work sheet",
        Icon: WbSunny,
        accent: "amber",
      },
    ],
  },
};

/** Import slots to show when the operator hasn't picked a booking type
 * yet - defaults to the two-sheet layout, the least surprising fallback. */
export const DEFAULT_SLOTS = BOOKING_TYPE_INFO.general.slots;
