"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Sending link…");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    setStatus(
      error ? `Could not send link: ${error.message}` : "Check your email for a sign-in link."
    );
  }

  if (loading) return null;

  if (!session) {
    return (
      <div id="app">
        <section className="panel" style={{ maxWidth: 420, margin: "80px auto" }}>
          <h2>Sign in</h2>
          <p className="note" style={{ marginTop: 0 }}>
            Enter your email — we&apos;ll send you a link to sign in, no
            password needed. Your timesheet data is private to your account.
          </p>
          <form
            onSubmit={sendMagicLink}
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ flex: "1 1 200px" }}
            />
            <button type="submit">Send link</button>
          </form>
          {status && (
            <div className="note" style={{ marginTop: 10 }}>
              {status}
            </div>
          )}
        </section>
      </div>
    );
  }

  return <>{children}</>;
}
