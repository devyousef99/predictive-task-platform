"use client";
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { HealthStatus } from "@ptp/forecast";

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

/* ─── Button ─────────────────────────────────────────────────────────────── */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", isLoading, icon, full, className, children, disabled, ...rest }, ref,
) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-md whitespace-nowrap select-none transition-[transform,background-color,box-shadow] duration-150 ease-out active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
  const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-[14px]", lg: "h-12 px-5 text-[15px]" }[size];
  const variants = {
    primary: "bg-accent text-white hover:bg-accent-hover shadow-[0_1px_0_rgb(0_0_0/0.08)]",
    secondary: "bg-surface text-ink-900 border border-line hover:bg-slate-50",
    ghost: "text-brand-600 hover:bg-brand-50",
    danger: "bg-[#B91C1C] text-white hover:bg-[#991B1B]",
  }[variant];
  return (
    <button ref={ref} className={cx(base, sizes, variants, full && "w-full", className)} disabled={disabled || isLoading} aria-busy={isLoading} {...rest}>
      {isLoading ? <Spinner /> : icon}
      <span>{children}</span>
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Input ──────────────────────────────────────────────────────────────── */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, trailing, id, className, ...rest }, ref) {
  const inputId = id ?? rest.name;
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={inputId} className="block text-[13px] font-medium text-ink-900">{label}</label>}
      <div className="relative">
        <input
          ref={ref} id={inputId}
          aria-invalid={!!error} aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
          className={cx(
            "h-10 w-full rounded-md border-[1.5px] bg-surface px-3 text-[14px] text-ink-900 placeholder:text-ink-400 transition-[border-color,box-shadow] duration-150",
            error ? "border-danger-600 focus:shadow-focus-danger" : "border-line hover:border-ink-300 focus:border-brand-600 focus:shadow-focus",
            !!trailing && "pe-10", className,
          )}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 end-0 flex items-center pe-3 text-ink-500">{trailing}</div>}
      </div>
      {error ? (
        <p id={`${inputId}-err`} role="alert" className="flex items-start gap-1.5 text-[13px] text-danger-700">
          <svg className="mt-[3px] h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm-.75 3.25h1.5v4.5h-1.5v-4.5Zm0 5.5h1.5v1.5h-1.5v-1.5Z"/></svg>
          {error}
        </p>
      ) : hint ? <p id={`${inputId}-hint`} className="text-[13px] text-ink-500">{hint}</p> : null}
    </div>
  );
});

/* ─── Surfaces ───────────────────────────────────────────────────────────── */
export function Card({ children, className, title, action, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; padded?: boolean }) {
  return (
    <section className={cx("rounded-lg bg-surface shadow-card", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h3 className="text-[15px]">{title}</h3>
          {action}
        </header>
      )}
      <div className={padded ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[22px] sm:text-[24px] leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-500 max-w-[60ch]">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

/* ─── Badges ─────────────────────────────────────────────────────────────── */
export const HEALTH_STYLE: Record<HealthStatus, { dot: string; chip: string }> = {
  "on-track": { dot: "bg-ok-600", chip: "bg-ok-50 text-ok-700" },
  "at-risk": { dot: "bg-warn-600", chip: "bg-warn-50 text-warn-700" },
  delayed: { dot: "bg-danger-600", chip: "bg-danger-50 text-danger-700" },
  "not-started": { dot: "bg-ink-400", chip: "bg-slate-100 text-ink-700" },
  completed: { dot: "bg-accent", chip: "bg-brand-50 text-brand-700" },
};

export function HealthBadge({ health, label, size = "md" }: { health: HealthStatus; label: string; size?: "sm" | "md" }) {
  const s = HEALTH_STYLE[health];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full font-medium", s.chip, size === "sm" ? "px-2 py-0.5 text-[12px]" : "px-2.5 py-1 text-[13px]")}>
      <span className={cx("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
      {label}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "warn" | "danger" | "ok" }) {
  const tones = {
    neutral: "bg-slate-100 text-ink-700", brand: "bg-brand-50 text-brand-700",
    warn: "bg-warn-50 text-warn-700", danger: "bg-danger-50 text-danger-700", ok: "bg-ok-50 text-ok-700",
  }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium", tones)}>{children}</span>;
}

export function PriorityDot({ priority, label }: { priority: "low" | "medium" | "high" | "critical"; label: string }) {
  const c = { low: "bg-ink-300", medium: "bg-brand-500", high: "bg-warn-600", critical: "bg-danger-600" }[priority];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-500">
      <span className={cx("h-2 w-2 rounded-sm", c)} aria-hidden />{label}
    </span>
  );
}

/* ─── People ─────────────────────────────────────────────────────────────── */
const AVATAR_HUES = ["bg-accent", "bg-ok-600", "bg-warn-600", "bg-violet-600", "bg-rose-600", "bg-cyan-700"];
export function Avatar({ initials, name, size = 28, index = 0 }: { initials: string; name: string; size?: number; index?: number }) {
  return (
    <span title={name} aria-label={name} role="img"
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full text-white font-semibold ring-2 ring-surface", AVATAR_HUES[index % AVATAR_HUES.length])}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

export function AvatarStack({ people }: { people: { initials: string; name: string; index: number }[] }) {
  return (
    <span className="flex -space-x-1.5 rtl:space-x-reverse">
      {people.slice(0, 4).map((p) => <Avatar key={p.name} {...p} size={24} />)}
      {people.length > 4 && <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium ring-2 ring-surface">+{people.length - 4}</span>}
    </span>
  );
}

/* ─── Data display ───────────────────────────────────────────────────────── */
export function Progress({ value, tone = "brand", height = 6 }: { value: number; tone?: "brand" | "ok" | "warn" | "danger"; height?: number }) {
  const bar = { brand: "bg-accent", ok: "bg-ok-600", warn: "bg-warn-600", danger: "bg-danger-600" }[tone];
  return (
    <div className="w-full overflow-hidden rounded-full bg-slate-100" style={{ height }} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-[width] duration-500 ease-out", bar)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function StatTile({ label, value, delta, deltaGood, hint }: { label: string; value: ReactNode; delta?: string; deltaGood?: boolean; hint?: string }) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-card">
      <p className="text-[13px] text-ink-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-none text-ink-900 tabular-nums">{value}</span>
        {delta && <span className={cx("text-[12px] font-medium tabular-nums", deltaGood ? "text-ok-700" : "text-danger-700")}>{delta}</span>}
      </div>
      {hint && <p className="mt-1.5 text-[12px] text-ink-400">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <svg className="mb-3 h-10 w-10 text-brand-200" viewBox="0 0 40 40" fill="none" aria-hidden>
        <rect x="6" y="8" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="2" />
        <path d="M12 16h16M12 22h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p className="font-semibold text-ink-900">{title}</p>
      <p className="mt-1 max-w-[36ch] text-[13px] text-ink-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ─── Icons (inline, 20px, currentColor) ─────────────────────────────────── */
const I = ({ d, className }: { d: string; className?: string }) => (
  <svg className={cx("h-5 w-5 shrink-0", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
export const Icons = {
  dashboard: (p?: { className?: string }) => <I {...p} d="M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-4H4v4Zm10-9h6V4h-6v7Z" />,
  projects: (p?: { className?: string }) => <I {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  tasks: (p?: { className?: string }) => <I {...p} d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  roles: (p?: { className?: string }) => <I {...p} d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Zm-3 9 2 2 4-4" />,
  billing: (p?: { className?: string }) => <I {...p} d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm0 3h18M7 15h3" />,
  settings: (p?: { className?: string }) => <I {...p} d="M4 6h9m4 0h3M4 12h3m4 0h9M4 18h9m4 0h3M13 4v4M7 10v4m6 2v4" />,
  sun: (p?: { className?: string }) => <I {...p} d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-14v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4" />,
  moon: (p?: { className?: string }) => <I {...p} d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  userPlus: (p?: { className?: string }) => <I {...p} d="M15 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 3 17.5V19M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9-3v6m-3-3h6" />,
  team: (p?: { className?: string }) => <I {...p} d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 8v-1.3a3 3 0 0 0-2-2.8M15 4.2a3.5 3.5 0 0 1 0 6.6" />,
  more: (p?: { className?: string }) => <I {...p} d="M5 12h.01M12 12h.01M19 12h.01" />,
  search: (p?: { className?: string }) => <I {...p} d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4" />,
  bell: (p?: { className?: string }) => <I {...p} d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4h4" />,
  plus: (p?: { className?: string }) => <I {...p} d="M12 5v14M5 12h14" />,
  back: (p?: { className?: string }) => <I {...p} className={cx("rtl:-scale-x-100", p?.className)} d="m15 6-6 6 6 6" />,
  chevron: (p?: { className?: string }) => <I {...p} className={cx("rtl:-scale-x-100", p?.className)} d="m9 6 6 6-6 6" />,
  check: (p?: { className?: string }) => <I {...p} d="m5 12 5 5L20 7" />,
  globe: (p?: { className?: string }) => <I {...p} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c-3 3.5-3 14.5 0 18m0-18c3 3.5 3 14.5 0 18M3 12h18" />,
  logout: (p?: { className?: string }) => <I {...p} d="M10 17H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4m4 8 5-3-5-3m5 3H10" />,
  warning: (p?: { className?: string }) => <I {...p} d="M12 9v4m0 4h.01M10.3 3.9 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  calendar: (p?: { className?: string }) => <I {...p} d="M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm3-3v4m8-4v4M4 11h16" />,
  lock: (p?: { className?: string }) => <I {...p} d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />,
  x: (p?: { className?: string }) => <I {...p} d="M6 6l12 12M18 6 6 18" />,
  spark: (p?: { className?: string }) => <I {...p} d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1M12 8l1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2L12 8Z" />,
};

/* ─── Form controls ──────────────────────────────────────────────────────── */
export const controlCls = "h-10 w-full rounded-md border-[1.5px] border-line bg-surface px-3 text-[14px] text-ink-900 transition-[border-color,box-shadow] duration-150 hover:border-ink-300 focus:border-brand-600 focus:shadow-focus disabled:bg-slate-50 disabled:text-ink-500";

export function Field({ id, label, hint, error, optional, children, className }: { id?: string; label: string; hint?: ReactNode; error?: string; optional?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink-900">{label}{optional && <span className="ms-1 font-normal text-ink-400">({optional})</span>}</label>
      {children}
      {error ? <p role="alert" className="text-[13px] text-danger-700">{error}</p> : hint ? <p className="text-[13px] text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function Select({ id, value, onChange, children, disabled, className, ariaLabel, size = "md" }: { id?: string; value: string; onChange: (v: string) => void; children: ReactNode; disabled?: boolean; className?: string; ariaLabel?: string; size?: "sm" | "md" }) {
  return <select id={id} aria-label={ariaLabel} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cx(controlCls, size === "sm" && "h-9 text-[13px]", className)}>{children}</select>;
}

export function TextArea({ id, value, onChange, placeholder, rows = 3 }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea id={id} value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cx(controlCls, "h-auto resize-y py-2 leading-relaxed placeholder:text-ink-400")} />;
}

export function Switch({ checked, onChange, label, disabled, size = "md" }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; size?: "sm" | "md" }) {
  const w = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const shift = size === "sm" ? "translate-x-4 rtl:-translate-x-4" : "translate-x-5 rtl:-translate-x-5";
  return (
    <label className={cx("inline-flex items-center gap-2 text-[13px] text-ink-900", disabled ? "opacity-50" : "cursor-pointer")}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx("relative inline-flex shrink-0 items-center rounded-full transition-colors duration-150", w, checked ? "bg-accent" : "bg-ink-300")}>
        <span className={cx("absolute start-0.5 rounded-full bg-surface shadow transition-transform duration-150", knob, checked && shift)} />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}

/**
 * Centered dialog. Rendered into <body> through a portal: pages animate in with a transform
 * (`animate-rise`), and a transformed ancestor would otherwise trap this `fixed` overlay inside
 * the content area instead of covering the whole viewport.
 */
export function Modal({ open, title, subtitle, onClose, children, actions, size = "sm" }: { open: boolean; title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode; size?: "sm" | "lg" }) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Escape closes; the page behind doesn't scroll while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-4 sm:items-center sm:p-6" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}
        className={cx("flex max-h-[calc(100dvh-2rem)] w-full animate-rise flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-pop sm:max-h-[calc(100dvh-3rem)]", size === "lg" ? "max-w-2xl" : "max-w-sm")}>
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[16px] font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-me-1.5 -mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-500 hover:bg-slate-100 hover:text-ink-900">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {actions && <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
