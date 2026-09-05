"use client";

import { useId, useState } from "react";
import { ArrowRight, Building2, Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import LogoMark from "./LogoMark";

const FIELD_CLASS =
  "w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 transition focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/15";

// A password field with a show/hide (eye) toggle on the right, so the
// left-hand lock icon and the toggle never overlap.
function PasswordField({ id, value, onChange, placeholder = "••••••••", autoFocus, minLength }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Lock
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
      />
      <input
        id={id}
        type={visible ? "text" : "password"}
        required
        autoFocus={autoFocus}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${FIELD_CLASS} pr-9`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 transition hover:text-stone-600"
      >
        {visible ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
    </div>
  );
}

// Shared "check your inbox" confirmation screen — used after sign-up
// (confirm your email) and after requesting a password reset. The logo
// sits in its own flex column so it's actually centered instead of
// relying on the card's text-center to center a block-level SVG.
function InfoScreen({ title, message, cta, onCta }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <div className="flex flex-col items-center">
          <LogoMark size={56} />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-stone-900">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">{message}</p>
        </div>
        <button
          onClick={onCta}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900"
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

// Real Supabase Auth: sign up, sign in, and forgot-password (request
// side). None of these call a prop on success — Workspace listens for
// the resulting auth state change itself via supabase.auth.onAuthStateChange
// and re-renders once a session exists (or, for a recovery link, shows
// ResetPasswordForm below instead).
export default function SignIn() {
  const [mode, setMode] = useState("signup"); // "signup" | "signin" | "forgot"
  const [screen, setScreen] = useState("form"); // "form" | "confirm-email" | "forgot-sent"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const uid = useId();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim(), company: company.trim() || null } },
        });
        if (signUpError) throw signUpError;
        // No session yet means the project has "confirm email" turned on.
        if (data.user && !data.session) setScreen("confirm-email");
      } else if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        });
        if (resetError) throw resetError;
        setScreen("forgot-sent");
      }
    } catch (err) {
      setError(err.message || "Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (screen === "confirm-email") {
    return (
      <InfoScreen
        title="Check your email"
        message={
          <>
            We sent a confirmation link to <span className="font-medium text-stone-700">{email}</span>.
            Click it, then come back and sign in.
          </>
        }
        cta="Back to sign in"
        onCta={() => {
          setScreen("form");
          setMode("signin");
        }}
      />
    );
  }

  if (screen === "forgot-sent") {
    return (
      <InfoScreen
        title="Check your email"
        message={
          <>
            We sent a password reset link to{" "}
            <span className="font-medium text-stone-700">{email}</span>. Click it to choose a new
            password.
          </>
        }
        cta="Back to sign in"
        onCta={() => {
          setScreen("form");
          setMode("signin");
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogoMark size={56} />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-stone-900">
            {mode === "signup"
              ? "Create your workspace"
              : mode === "signin"
                ? "Welcome back"
                : "Reset your password"}
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {mode === "signup"
              ? "A few details to set up your account."
              : mode === "signin"
                ? "Sign in to pick up right where you left off."
                : "We'll email you a link to choose a new password."}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
        >
          <div className="space-y-4">
            {mode === "signup" && (
              <div>
                <label
                  htmlFor={`${uid}-name`}
                  className="mb-1.5 block text-sm font-medium text-stone-700"
                >
                  Full name
                </label>
                <div className="relative">
                  <User
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />
                  <input
                    id={`${uid}-name`}
                    autoFocus
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Chen"
                    maxLength={80}
                    className={FIELD_CLASS}
                  />
                </div>
              </div>
            )}
            <div>
              <label
                htmlFor={`${uid}-email`}
                className="mb-1.5 block text-sm font-medium text-stone-700"
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <input
                  id={`${uid}-email`}
                  type="email"
                  required
                  autoFocus={mode !== "signup"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@company.com"
                  maxLength={200}
                  className={FIELD_CLASS}
                />
              </div>
            </div>
            {mode !== "forgot" && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor={`${uid}-password`}
                    className="block text-sm font-medium text-stone-700"
                  >
                    Password
                  </label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError("");
                      }}
                      className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <PasswordField
                  id={`${uid}-password`}
                  value={password}
                  onChange={setPassword}
                  minLength={6}
                />
              </div>
            )}
            {mode === "signup" && (
              <div>
                <label
                  htmlFor={`${uid}-company`}
                  className="mb-1.5 block text-sm font-medium text-stone-700"
                >
                  Company <span className="font-normal text-stone-400">(optional)</span>
                </label>
                <div className="relative">
                  <Building2
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />
                  <input
                    id={`${uid}-company`}
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Inc."
                    maxLength={120}
                    className={FIELD_CLASS}
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <>
                {mode === "signup" ? "Create workspace" : mode === "signin" ? "Sign in" : "Send reset link"}{" "}
                <ArrowRight size={15} />
              </>
            )}
          </button>
          {mode !== "forgot" ? (
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === "signup" ? "signin" : "signup"));
                setError("");
              }}
              className="mt-4 w-full text-center text-xs text-stone-500 hover:text-stone-700"
            >
              {mode === "signup" ? "Already have a workspace? Sign in" : "Need a workspace? Create one"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
              }}
              className="mt-4 w-full text-center text-xs text-stone-500 hover:text-stone-700"
            >
              Back to sign in
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

// Shown instead of the normal sign-in/app screens while Supabase has a
// password-recovery session active (Workspace's auth listener detects
// the PASSWORD_RECOVERY event, which fires automatically the moment the
// reset-link URL is loaded). Submitting calls auth.updateUser(), which
// fires a follow-up auth event that clears the recovery flag and drops
// the user straight into the app — no separate "continue" step needed.
export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const uid = useId();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError(updateError.message || "Couldn't update your password — try again.");
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogoMark size={56} />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-stone-900">
            Choose a new password
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">Make it at least 6 characters.</p>
        </div>
        <form
          onSubmit={submit}
          className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor={`${uid}-new`}
                className="mb-1.5 block text-sm font-medium text-stone-700"
              >
                New password
              </label>
              <PasswordField
                id={`${uid}-new`}
                value={password}
                onChange={setPassword}
                autoFocus
                minLength={6}
              />
            </div>
            <div>
              <label
                htmlFor={`${uid}-confirm`}
                className="mb-1.5 block text-sm font-medium text-stone-700"
              >
                Confirm password
              </label>
              <PasswordField
                id={`${uid}-confirm`}
                value={confirm}
                onChange={setConfirm}
                minLength={6}
              />
            </div>
          </div>
          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {loading ? <Loader2 className="animate-spin" size={15} /> : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
