"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface BasicProfile {
  name: string;
  operatorNumber: string;
  email: string;
}

export default function ProfilePage() {
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

  return (
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
  );
}
