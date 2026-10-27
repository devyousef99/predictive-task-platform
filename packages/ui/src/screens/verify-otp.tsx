"use client";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { ApiError, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, useAuthHydrated, useAuthStore } from "@ptp/api";
import { useApp, useT } from "../context";
import { Button, Icons, Spinner, cx } from "../primitives";
import { AuthLayout, FormAlert } from "./login";

const LENGTH = 6;
const empty = () => Array<string>(LENGTH).fill("");

/** Step 2 of sign-in: enter the 6-digit code emailed by POST /auth/login. */
export function VerifyOtpScreen() {
  const { signIn, navigate, locale } = useApp();
  const { t } = useT();
  const hydrated = useAuthHydrated();
  const { status, user, token, otpSentAt, verifyOtp, resendOtp, logout } = useAuthStore();

  const [digits, setDigits] = useState(empty);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const now = useNow();

  const pending = status === "pendingOtp" && !!user;
  const expiresIn = otpSentAt ? otpSentAt + OTP_TTL_MS - now : 0;
  const resendIn = otpSentAt ? otpSentAt + OTP_RESEND_COOLDOWN_MS - now : 0;
  const expired = expiresIn <= 0;

  useEffect(() => { if (hydrated && pending) inputs.current[0]?.focus(); }, [hydrated, pending]);

  async function submit(code = digits.join("")) {
    if (busy || !user) return;
    if (code.length !== LENGTH) { setError(t("otp.incomplete")); return; }
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      const verified = await verifyOtp(code);
      // The store is now authenticated (sessionStorage); the host sends the user to their role's home page.
      await signIn(verified.email, verified.role, useAuthStore.getState().token ?? token ?? undefined);
    } catch (err) {
      setError((err instanceof ApiError && err.localized(locale)) || t("auth.badCredentials"));
      setDigits(empty());
      inputs.current[0]?.focus();
      setBusy(false);
    }
  }

  async function resend() {
    setResending(true); setError(undefined); setNotice(undefined);
    try {
      await resendOtp();
      setDigits(empty());
      setNotice(t("otp.resent"));
      inputs.current[0]?.focus();
    } catch (err) {
      setError((err instanceof ApiError && err.localized(locale)) || t("auth.badCredentials"));
    } finally {
      setResending(false);
    }
  }

  function startOver() {
    logout();
    navigate("/login");
  }

  /** Writes digits starting at `index` (typing, autofill, or paste) and auto-submits when complete. */
  function fill(index: number, value: string) {
    const chars = value.replace(/\D/g, "").slice(0, LENGTH - index).split("");
    if (!chars.length) return;
    const next = [...digits];
    chars.forEach((c, i) => { next[index + i] = c; });
    setDigits(next);
    setError(undefined);
    inputs.current[Math.min(index + chars.length, LENGTH - 1)]?.focus();
    if (next.every(Boolean)) void submit(next.join(""));
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) next[i] = "";
      else if (i > 0) { next[i - 1] = ""; inputs.current[i - 1]?.focus(); }
      setDigits(next);
    } else if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < LENGTH - 1) inputs.current[i + 1]?.focus();
  }

  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    fill(i, e.clipboardData.getData("text"));
  }

  if (!hydrated) {
    return <AuthLayout><div className="flex justify-center py-16 text-ink-400"><Spinner className="h-6 w-6" /></div></AuthLayout>;
  }

  if (!pending) {
    return (
      <AuthLayout>
        <h1 className="text-[24px]">{t("otp.title")}</h1>
        <div className="mt-6"><FormAlert>{t("otp.noPending")}</FormAlert></div>
        <Button className="mt-5" size="lg" full onClick={startOver}>{t("auth.signIn")}</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600"><MailIcon /></span>
      <h1 className="text-[24px]">{t("otp.title")}</h1>
      <p className="mt-1 text-ink-500">
        {t("otp.subtitle", { email: "⁨" + user.email + "⁩" })}
      </p>

      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void submit(); }} noValidate className="mt-7 space-y-4">
        {error && <FormAlert>{error}</FormAlert>}
        {notice && !error && <FormAlert tone="ok">{notice}</FormAlert>}

        <fieldset disabled={busy}>
          <legend className="mb-1.5 block text-[13px] font-medium text-ink-900">{t("otp.codeLabel")}</legend>
          {/* Digits always read left-to-right, also in Arabic. */}
          <div dir="ltr" className="flex justify-between gap-2">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                value={d}
                onChange={(e) => fill(i, typedValue(d, e.target.value))}
                onKeyDown={(e) => onKeyDown(i, e)}
                onPaste={(e) => onPaste(i, e)}
                onFocus={(e) => e.target.select()}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                pattern="[0-9]*"
                maxLength={LENGTH}
                aria-label={t("otp.digit", { n: i + 1 })}
                aria-invalid={!!error}
                className={cx(
                  "h-14 w-full min-w-0 max-w-[56px] rounded-md border-[1.5px] bg-surface text-center text-[22px] font-semibold tabular-nums text-ink-900 transition-[border-color,box-shadow] duration-150",
                  error ? "border-danger-600 focus:shadow-focus-danger" : "border-line hover:border-ink-300 focus:border-brand-600 focus:shadow-focus",
                )}
              />
            ))}
          </div>
        </fieldset>

        <p className={cx("text-[13px]", expired ? "text-danger-700" : "text-ink-500")} aria-live="polite">
          {expired ? t("otp.expired") : t("otp.expiresIn", { time: formatClock(expiresIn) })}
        </p>

        <Button type="submit" size="lg" full isLoading={busy} disabled={expired}>{busy ? t("otp.verifying") : t("otp.verify")}</Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-ink-500">
        {t("otp.noCode")}{" "}
        {resendIn > 0 && !expired ? (
          <span className="tabular-nums text-ink-400">{t("otp.resendIn", { s: Math.ceil(resendIn / 1000) })}</span>
        ) : (
          <button type="button" onClick={resend} disabled={resending} className="font-medium text-brand-600 hover:underline disabled:opacity-50">
            {resending ? t("otp.resending") : t("otp.resend")}
          </button>
        )}
      </p>
      <button type="button" onClick={startOver} className="mx-auto mt-3 flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-900">
        <Icons.back className="h-4 w-4" />{t("otp.back")}
      </button>
    </AuthLayout>
  );
}

/** Current time, re-rendered every second (drives the countdowns). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Typing over a filled box yields "old+new"; keep just the new digit. Longer values (autofill) pass through. */
const typedValue = (previous: string, value: string) =>
  previous && value.length === 2 ? (value.startsWith(previous) ? value.slice(1) : value.slice(0, 1)) : value;

const formatClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function MailIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}
