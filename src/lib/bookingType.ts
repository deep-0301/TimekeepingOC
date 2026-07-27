import type { PaySettings } from "./types";

export type BookingType = NonNullable<PaySettings["bookingType"]>;

export interface BookingSheetSlotDef {
  key: string;
  title: string;
  icon: string;
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
      { key: "daily", title: "Booking sheet", icon: "🗓️", accent: "steel" },
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
        icon: "🗓️",
        accent: "steel",
      },
      {
        key: "weekend",
        title: "Weekend / holiday sheet",
        icon: "🎉",
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
        icon: "🗓️",
        accent: "steel",
      },
      {
        key: "holidayStat",
        title: "Holiday stat work sheet",
        icon: "🎉",
        accent: "amber",
      },
    ],
  },
};

/** Import slots to show when the operator hasn't picked a booking type
 * yet - defaults to the two-sheet layout, the least surprising fallback. */
export const DEFAULT_SLOTS = BOOKING_TYPE_INFO.general.slots;
