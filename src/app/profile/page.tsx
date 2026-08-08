"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ExchangeNotSetUpError,
  loadMyContact,
  saveMyContact,
  type MyContact,
} from "@/lib/exchange";

interface BasicProfile {
  name: string;
  operatorNumber: string;
  email: string;
}

/**
 * How to be reached, for the work exchange and nothing else.
 *
 * Kept here rather than asked for at sign-up: an operator who never uses the
 * exchange never has to give a number, and one who does can change or remove
 * it in the same place they gave it. It is released only to the other party
 * of an accepted offer - the database enforces that, not this screen.
 */
function ContactSettings() {
  const [contact, setContact] = useState<MyContact>({ contact: "", contactKind: "" });
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const c = await loadMyContact();
        if (!live) return;
        setContact(c);
        setState("ready");
      } catch (err) {
        if (!live) return;
        setState(err instanceof ExchangeNotSetUpError ? "unavailable" : "ready");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const save = async () => {
    setError("");
    setSaved(false);
    try {
      await saveMyContact(contact);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (state === "loading") return <div className="note">Loading…</div>;
  if (state === "unavailable") {
    return (
      <div className="note">
        The work exchange has not been set up on this database yet, so there is
        nothing to be reached about.
      </div>
    );
  }

  return (
    <>
      <div className="day-editor-extras">
        <div className="field">
          <label htmlFor="contact-kind">How should people reach you?</label>
          <select
            id="contact-kind"
            value={contact.contactKind}
            onChange={(e) => {
              setSaved(false);
              setContact({
                ...contact,
                contactKind: e.target.value as MyContact["contactKind"],
              });
            }}
          >
            <option value="">Not on the exchange</option>
            <option value="phone">Phone call</option>
            <option value="text">Text message only</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="contact-value">
            {contact.contactKind === "email" ? "Email address" : "Number"}
          </label>
          <input
            id="contact-value"
            type="text"
            value={contact.contact}
            placeholder={contact.contactKind === "email" ? "you@example.com" : "613 555 0143"}
            onChange={(e) => {
              setSaved(false);
              setContact({ ...contact, contact: e.target.value });
            }}
          />
        </div>
      </div>
      <div className="note">
        Shown only to an operator whose offer you have accepted, or whose post
        you have taken. It is never on the board, and no one else can read it.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button className="small" onClick={() => void save()}>
          Save contact
        </button>
        {saved && <span className="note" style={{ margin: 0 }}>Saved.</span>}
      </div>
      {error && <div className="note">{error}</div>}
    </>
  );
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
        <h2>Work Exchange contact</h2>
        <ContactSettings />
      </section>
    </>
  );
}
