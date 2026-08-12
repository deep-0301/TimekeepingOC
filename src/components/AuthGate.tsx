"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { describeAuthError } from "@/lib/authErrors";
import BusSearch from "./BusSearch";
import {
  CheckCircle,
  ChevronLeft,
  DirectionsBus,
  RadioButtonUnchecked,
} from "./icons";

const PASSWORD_RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "At least one letter", test: (pw) => /[a-zA-Z]/.test(pw) },
  { label: "At least one number", test: (pw) => /[0-9]/.test(pw) },
];

/**
 * Whether signing in and creating an account are offered.
 *
 * Off for now. A visitor lands on the bus tracker and that is the whole app
 * as far as they are concerned - no forms, and nothing offering an account
 * that is not being taken yet.
 *
 * This hides the door rather than locking it. An operator who is already
 * signed in still opens the full timesheet, and the forms are still reachable
 * at #signin - which matters, because this is a static site with no way to
 * let anybody back in short of a redeploy. Set this back to true to offer
 * them again.
 */
const SIGN_IN_OFFERED = false;

/** The way back to the forms while they are not being offered. */
const SIGN_IN_HASH = "#signin";

function wantsSignIn(): boolean {
  return typeof window !== "undefined" && window.location.hash === SIGN_IN_HASH;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "signup">("login");
  /**
   * Looking up a bus without an account.
   *
   * Everything else here is one operator's own record and needs a sign-in to
   * mean anything. Which bus is on a run is not: it is public information,
   * painted on the side of the bus and published in OC Transpo's own feed. An
   * operator standing at a garage door who has not signed up yet - or who is
   * on someone else's phone - should be able to ask that question and get an
   * answer, rather than be asked to create an account first.
   */
  // Chosen from the sign-in card, where that card is on offer at all. Where
  // it is not, `formsAvailable` below is what puts a visitor on the tracker.
  const [tracking, setTracking] = useState(false);
  // Asked for by the address bar rather than by a button, while the forms are
  // not being offered.
  const [asked, setAsked] = useState(wantsSignIn);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    const onHash = () => setAsked(wantsSignIn());
    window.addEventListener("hashchange", onHash);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  if (loading) return null;

  // The forms, where they are on offer or have been asked for by name.
  const formsAvailable = SIGN_IN_OFFERED || asked;

  if (!session && (tracking || !formsAvailable)) {
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
            {formsAvailable && (
              <button
                type="button"
                className="ghost small public-track-back"
                onClick={() => setTracking(false)}
              >
                <ChevronLeft />
                Sign in
              </button>
            )}
          </div>

          <BusSearch />

          {formsAvailable && (
            <div className="public-track-note">
              Signing in adds the rest: your booking sheets imported into a
              calendar, pay worked out per period, hours of service, and the
              bus you had on a run kept with the day.
            </div>
          )}
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
              className={"auth-tab" + (mode === "login" ? " auth-tab-active" : "")}
              onClick={() => setMode("login")}
            >
              Log in
            </button>
            <button
              className={"auth-tab" + (mode === "signup" ? " auth-tab-active" : "")}
              onClick={() => setMode("signup")}
            >
              Create account
            </button>
            <div
              className="auth-tab-underline"
              style={{ left: mode === "login" ? "0%" : "50%", width: "50%" }}
            />
          </div>

          {mode === "login" ? <LoginForm /> : <SignupForm />}

          <div className="auth-aside">
            <button
              type="button"
              className="auth-aside-link"
              onClick={() => setTracking(true)}
            >
              <DirectionsBus />
              Just looking for a bus? Track one without an account
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
