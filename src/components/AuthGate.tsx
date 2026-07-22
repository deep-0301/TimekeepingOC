"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "signup">("login");

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

  if (loading) return null;

  if (!session) {
    return (
      <div id="app">
        <section
          className="panel"
          style={{ maxWidth: 420, margin: "60px auto" }}
        >
          <div
            style={{
              display: "flex",
              gap: 4,
              marginBottom: 16,
              borderBottom: "1px solid var(--line)",
            }}
          >
            <button
              className={"ghost small" + (mode === "login" ? "" : "")}
              style={{
                borderBottom:
                  mode === "login" ? "2px solid var(--steel-dark)" : "none",
                borderRadius: 0,
              }}
              onClick={() => setMode("login")}
            >
              Log in
            </button>
            <button
              className="ghost small"
              style={{
                borderBottom:
                  mode === "signup" ? "2px solid var(--steel-dark)" : "none",
                borderRadius: 0,
              }}
              onClick={() => setMode("signup")}
            >
              Create account
            </button>
          </div>
          {mode === "login" ? <LoginForm /> : <SignupForm />}
        </section>
      </div>
    );
  }

  return <>{children}</>;
}

function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("Signing in…");

    let email = identifier.trim();
    if (!email.includes("@")) {
      const { data, error } = await supabase.rpc("get_email_for_operator", {
        op_number: email,
      });
      if (error || !data) {
        setStatus("No account found for that operator number.");
        setBusy(false);
        return;
      }
      email = data as string;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    setStatus(error ? error.message : "");
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Operator number or email</label>
        <input
          type="text"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button type="submit" disabled={busy}>
        Log in
      </button>
      {status && (
        <div className="note" style={{ marginTop: 10 }}>
          {status}
        </div>
      )}
    </form>
  );
}

function SignupForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [operatorNumber, setOperatorNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [retypePassword, setRetypePassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== retypePassword) {
      setStatus("Passwords don't match.");
      return;
    }
    setBusy(true);
    setStatus("Creating account…");

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          operator_number: operatorNumber.trim(),
        },
      },
    });

    setBusy(false);
    if (error) {
      setStatus(
        error.message.toLowerCase().includes("duplicate") ||
          error.message.toLowerCase().includes("unique")
          ? "That operator number is already registered."
          : error.message
      );
      return;
    }
    if (!data.session) {
      setStatus("Account created — check your email to confirm, then log in.");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="settings-grid" style={{ marginBottom: 10 }}>
        <div className="field">
          <label>First name</label>
          <input
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Last name</label>
          <input
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Operator number</label>
          <input
            type="text"
            required
            value={operatorNumber}
            onChange={(e) => setOperatorNumber(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Retype password</label>
          <input
            type="password"
            required
            value={retypePassword}
            onChange={(e) => setRetypePassword(e.target.value)}
          />
        </div>
      </div>
      <button type="submit" disabled={busy}>
        Create account
      </button>
      {status && (
        <div className="note" style={{ marginTop: 10 }}>
          {status}
        </div>
      )}
    </form>
  );
}
