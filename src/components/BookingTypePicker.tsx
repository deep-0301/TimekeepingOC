"use client";

import { BOOKING_TYPE_INFO, type BookingType } from "@/lib/bookingType";

const ORDER: BookingType[] = ["daily", "general", "holiday"];

export default function BookingTypePicker({
  value,
  onChange,
}: {
  value: BookingType | null;
  onChange: (bt: BookingType) => void;
}) {
  return (
    <div className="booking-type-grid">
      {ORDER.map((bt) => {
        const info = BOOKING_TYPE_INFO[bt];
        const selected = value === bt;
        return (
          <button
            key={bt}
            type="button"
            className={
              "booking-type-card" + (selected ? " booking-type-card-selected" : "")
            }
            onClick={() => onChange(bt)}
          >
            <div className="booking-type-card-label">
              {info.label}
              {selected && <span className="badge match">current</span>}
            </div>
            <div className="booking-type-card-desc">{info.description}</div>
          </button>
        );
      })}
    </div>
  );
}
