"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { describeAuthError } from "@/lib/authErrors";
import BusSearch from "./BusSearch";
import { CheckCircle, DirectionsBus, RadioButtonUnchecked } from "./icons";

const PASSWORD_RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "At least one letter", test: (pw) => /[a-zA-Z]/.test(pw) },
  { label: "At least one number", test: (pw) => /[0-9]/.test(pw) },
];

/**
 * What a signed-out visitor is looking at.
 *
 * The tracker, unless they have asked for one of the forms. Everything else
 * in this app is one operator's own record and needs a sign-in to mean
 * anything; which bus is on a run is not - it is public, painted on the side
 * of the bus and published in OC Transpo's own feed. So that is what the door
 * opens onto, and signing in is offered beside it rather than in front of it.
 */
type View = "track" | "login" | "signup";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("track");

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

  if (!session && view === "track") {
    return (
      <div className="auth-shell auth-shell-wide">
        <div className="public-track">
          <div className="auth-brand">
            <div className="auth-brand-icon">
              <DirectionsBus />
            </div>
            <div>
              <div className="auth-brand-title">Find a bus</div>
              <div className="auth-brand-sub">No account needed</div>
            </div>
            {/* Both ways in, top right. Creating an account is the filled one
                because it is the one that leads anywhere new; an operator who
                already has one knows to look for "Log in". */}
            <div className="public-track-auth">
              <button
                type="button"
                className="ghost small"
                onClick={() => setView("login")}
              >
                Log in
              </button>
              <button
                type="button"
                className="small"
                onClick={() => setView("signup")}
              >
                Sign up
              </button>
            </div>
          </div>

          <BusSearch />

          <div className="public-track-note">
            An account adds the rest: your booking sheets imported into a
            calendar, pay worked out per period, hours of service, and the bus
            you had on a run kept with the day.
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-brand-icon">
              <DirectionsBus />
            </div>
            <div>
              <div className="auth-brand-title">Run Number Timesheet</div>
              <div className="auth-brand-sub">ATU279 · OC Transpo</div>
            </div>
          </div>

          <div className="auth-tabs">
            <button
              className={"auth-tab" + (view === "login" ? " auth-tab-active" : "")}
              onClick={() => setView("login")}
            >
              Log in
            </button>
            <button
              className={"auth-tab" + (view === "signup" ? " auth-tab-active" : "")}
              onClick={() => setView("signup")}
            >
              Create account
            </button>
            <div
              className="auth-tab-underline"
              style={{ left: view === "login" ? "0%" : "50%", width: "50%" }}
            />
          </div>

          {view === "login" ? <LoginForm /> : <SignupForm />}

          <div className="auth-aside">
            <button
              type="button"
              className="auth-aside-link"
              onClick={() => setView("track")}
            >
              <DirectionsBus />
              Back to the bus tracker
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setIsError(false);
    setStatus("Signing in…");

    let email = identifier.trim();
    if (!email.includes("@")) {
      const { data, error } = await supabase.rpc("get_email_for_operator", {
        op_number: email,
      });
      if (error || !data) {
        setStatus("No account found for that operator number.");
        setIsError(true);
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
    setStatus(error ? describeAuthError(error) : "");
    setIsError(!!error);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="auth-field-row">
        <label>Operator number or email</label>
        <input
          type="text"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
      </div>
      <div className="auth-field-row">
        <label>Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button type="submit" className="auth-submit" disabled={busy}>
        Log in
      </button>
      {status && (
        <div className={"auth-status" + (isError ? " auth-status-error" : "")}>
          {status}
        </div>
      )}
    </form>
  );
}

function SignupForm() {
  const [name, setName] = useState("");
  const [operatorNumber, setOperatorNumber] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailsMatch =
    confirmEmail.length === 0 ||
    email.trim().toLowerCase() === confirmEmail.trim().toLowerCase();
  const passwordChecks = PASSWORD_RULES.map((rule) => ({
    ...rule,
    met: rule.test(password),
  }));
  const passwordValid = passwordChecks.every((c) => c.met);
  const passwordsMatch =
    confirmPassword.length === 0 || password === confirmPassword;

  const canSubmit =
    name.trim() !== "" &&
    operatorNumber.trim() !== "" &&
    email.trim() !== "" &&
    confirmEmail.trim() !== "" &&
    email.trim().toLowerCase() === confirmEmail.trim().toLowerCase() &&
    passwordValid &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setIsError(false);
    setStatus("Creating account…");

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name.trim(),
          operator_number: operatorNumber.trim(),
        },
      },
    });

    setBusy(false);
    if (error) {
      const described = describeAuthError(error);
      const lower = described.toLowerCase();
      setIsError(true);
      setStatus(
        lower.includes("duplicate") || lower.includes("unique")
          ? "That operator number is already registered."
          : described
      );
      return;
    }
    if (!data.session) {
      setStatus("Account created — check your email to confirm, then log in.");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="auth-field-row">
        <label>Name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="auth-field-row">
        <label>Operator number</label>
        <input
          type="text"
          required
          value={operatorNumber}
          onChange={(e) => setOperatorNumber(e.target.value)}
        />
      </div>
      <div className="auth-field-row">
        <label>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="auth-field-row">
        <label>Confirm email</label>
        <input
          type="email"
          required
          className={!emailsMatch ? "field-invalid" : undefined}
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
        />
        {!emailsMatch && <div className="auth-hint">Emails don&apos;t match.</div>}
      </div>
      <div className="auth-field-row">
        <label>Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ul className="password-checklist">
          {passwordChecks.map((rule) => (
            <li key={rule.label} className={rule.met ? "met" : undefined}>
              <span className="check-icon">
                    {rule.met ? <CheckCircle /> : <RadioButtonUnchecked />}
                  </span>
              {rule.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="auth-field-row">
        <label>Confirm password</label>
        <input
          type="password"
          required
          className={!passwordsMatch ? "field-invalid" : undefined}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {!passwordsMatch && (
          <div className="auth-hint">Passwords don&apos;t match.</div>
        )}
      </div>
      <button
        type="submit"
        className="auth-submit"
        disabled={busy || !canSubmit}
      >
        Create account
      </button>
      {status && (
        <div className={"auth-status" + (isError ? " auth-status-error" : "")}>
          {status}
        </div>
      )}
    </form>
  );
}
