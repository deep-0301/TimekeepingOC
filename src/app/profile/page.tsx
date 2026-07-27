"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAppState } from "@/lib/AppStateContext";
import BookingTypePicker from "@/components/BookingTypePicker";
import { BOOKING_TYPE_INFO, type BookingType } from "@/lib/bookingType";

interface BasicProfile {
  name: string;
  operatorNumber: string;
  email: string;
}

export default function ProfilePage() {
  const { settings, saveSettings } = useAppState();
  const [profile, setProfile] = useState<BasicProfile | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      setProfile({
        name: (user.user_metadata?.full_name as string) || "",
        operatorNumber: (user.user_metadata?.operator_number as string) || "",
        email: user.email || "",
      });
    });
  }, []);

  const currentInfo = settings.bookingType
    ? BOOKING_TYPE_INFO[settings.bookingType]
    : null;

  return (
    <>
      <section className="panel">
        <h2>Profile</h2>
        {profile ? (
          <div className="day-editor-extras">
            <div className="field">
              <label>Name</label>
              <div className="field-value">{profile.name || "—"}</div>
            </div>
            <div className="field">
              <label>Operator number</label>
              <div className="field-value">{profile.operatorNumber || "—"}</div>
            </div>
            <div className="field">
              <label>Email</label>
              <div className="field-value">{profile.email || "—"}</div>
            </div>
          </div>
        ) : (
          <div className="note">Loading…</div>
        )}
      </section>

      <section className="panel">
        <h2>Current booking</h2>
        <div className="note" style={{ marginBottom: 10 }}>
          {currentInfo ? (
            <>
              <b>{currentInfo.label}</b> — {currentInfo.description}
            </>
          ) : (
            "You haven't picked a booking type yet."
          )}{" "}
          Changing this updates how many sheets Import Sheets asks for.
        </div>
        <BookingTypePicker
          value={settings.bookingType}
          onChange={(bt: BookingType) =>
            saveSettings({ ...settings, bookingType: bt })
          }
        />
      </section>
    </>
  );
}
