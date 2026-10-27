"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError, SKIP_OTP, useAuthStore } from "@ptp/api";
import { useApp, useT } from "../context";
import { Button, Icons, Input } from "../primitives";
import { Logo, ThemeToggle } from "../shell";

export const OTP_PATH = "/verify-otp";

export function LoginScreen() {
  const { navigate, locale, signIn } = useApp();
  const { t } = useT();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = t("auth.invalidEmail");
    if (password.length < 8) next.password = t("auth.shortPassword");
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await login(email, password); // emails a 6-digit code
      if (SKIP_OTP) {
        // DEMO ONLY: no emailed-code step — sign in with the login token and go to the role's home page.
        const u = useAuthStore.getState().skipOtp();
        await signIn(u.email, u.role, useAuthStore.getState().token ?? undefined);
        return;
      }
      navigate(OTP_PATH);
    } catch (err) {
      setErrors({ form: (err instanceof ApiError && err.localized(locale)) || t("auth.badCredentials") });
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-[24px]">{t("auth.title")}</h1>
      <p className="mt-1 text-ink-500">{t("auth.subtitle")}</p>

      <form onSubmit={submit} noValidate className="mt-7 space-y-4">
        {errors.form && <FormAlert>{errors.form}</FormAlert>}
        <Input name="email" type="email" label={t("auth.email")} autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="you@company.com" />
        <Input name="password" type="password" label={t("auth.password")} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} trailing={<Icons.lock className="h-4 w-4" />} />
        <div className="flex items-center justify-between text-[13px]">
          <label className="flex items-center gap-2 text-ink-700"><input type="checkbox" defaultChecked className="h-4 w-4 rounded border-line accent-brand-600" />{t("auth.remember")}</label>
          <a href="#" className="font-medium text-brand-600 hover:underline">{t("auth.forgot")}</a>
        </div>
        <Button type="submit" size="lg" full isLoading={busy}>{busy ? t("auth.signingIn") : t("auth.signIn")}</Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[12px] uppercase tracking-wide text-ink-400"><span className="h-px flex-1 bg-line" />{t("auth.or")}<span className="h-px flex-1 bg-line" /></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" type="button" icon={<Icons.lock className="h-4 w-4 text-ink-500" />}>{t("auth.sso")}</Button>
        <Button variant="secondary" type="button" icon={<GoogleG />}>{t("auth.google")}</Button>
      </div>

      <p className="mt-6 text-center text-[13px] text-ink-500">
        {t("auth.noAccount")} <a href="#" className="font-medium text-brand-600 hover:underline">{t("auth.startTrial")}</a>
        <span className="block text-[12px] text-ink-400">{t("auth.trialNote")}</span>
      </p>
    </AuthLayout>
  );
}

/** Error banner shown above auth forms. */
export function FormAlert({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "ok" }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={tone === "danger"
      ? "flex items-start gap-2 rounded-md border border-danger-600/30 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700"
      : "flex items-start gap-2 rounded-md border border-ok-600/30 bg-ok-50 px-3 py-2.5 text-[13px] text-ok-700"}>
      {tone === "danger" ? <Icons.warning className="mt-0.5 h-4 w-4 shrink-0" /> : <Icons.check className="mt-0.5 h-4 w-4 shrink-0" />}{children}
    </div>
  );
}

/** Brand panel + language/theme controls shared by the sign-in and email-code screens. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useApp();
  const { t } = useT();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-brand-800 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3"><Logo size={36} /><span className="text-[18px] font-bold tracking-tight">{t("app.name")}</span></div>
        <div className="relative z-10 max-w-[44ch]">
          <h2 className="text-[34px] font-semibold leading-[1.15] text-white">{t("app.tagline")}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#D9E6F6]">{t("auth.subtitle")}</p>
          <ForecastIllustration />
        </div>
        <p className="text-[12px] text-[#B3CDEC]">© 2026 {t("app.name")}. TLS 1.3 · AES-256 · SOC 2 ready.</p>
        <div className="absolute -end-32 -top-32 h-[420px] w-[420px] rounded-full bg-accent/50 blur-3xl" aria-hidden />
      </aside>

      {/* Form */}
      <div className="relative flex min-h-dvh flex-col px-5 py-8 sm:px-10 lg:min-h-0 lg:justify-center lg:px-16">
        <div className="mb-8 flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-2"><Logo /><span className="font-bold text-ink-900">{t("app.name")}</span></div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setLocale(locale === "en" ? "ar" : "en")} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-700 hover:bg-slate-100"><Icons.globe className="h-4 w-4" />{t("common.language")}</button>
            <ThemeToggle />
          </div>
        </div>
        <div className="absolute end-6 top-6 hidden items-center gap-1 lg:flex">
          <button type="button" onClick={() => setLocale(locale === "en" ? "ar" : "en")} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-700 hover:bg-slate-100"><Icons.globe className="h-4 w-4" />{t("common.language")}</button>
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.7 3.2-7.9Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

function ForecastIllustration() {
  // Planned vs forecast line — the product's core idea, drawn in the brand panel.
  return (
    <svg viewBox="0 0 420 180" className="mt-10 w-full max-w-[420px]" aria-hidden>
      <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7CC4FF" stopOpacity=".35" /><stop offset="1" stopColor="#7CC4FF" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3].map((i) => <line key={i} x1="0" x2="420" y1={20 + i * 40} y2={20 + i * 40} stroke="#fff" strokeOpacity=".12" />)}
      <path d="M0 150 L420 20" stroke="#fff" strokeOpacity=".5" strokeDasharray="6 6" strokeWidth="2" />
      <path d="M0 150 C 80 140, 130 120, 200 115 S 330 70, 420 60" stroke="#7CC4FF" strokeWidth="3" fill="none" />
      <path d="M0 150 C 80 140, 130 120, 200 115 S 330 70, 420 60 L420 180 L0 180Z" fill="url(#g)" />
      <circle cx="200" cy="115" r="5" fill="#fff" />
      <rect x="212" y="98" width="118" height="26" rx="6" fill="#0F172A" fillOpacity=".55" />
      <text x="222" y="115" fill="#fff" fontSize="12" fontFamily="system-ui">+10 working days late</text>
    </svg>
  );
}
