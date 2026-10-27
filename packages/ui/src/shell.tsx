"use client";
import { useState, type ReactNode } from "react";
import { PAGES, pageAllowed, type PageId } from "./access";
import { useApp, useCan, useT, useTheme } from "./context";
import { Avatar, Icons, cx } from "./primitives";

/**
 * Cross-zone navigation. Paths are absolute so that in production the shell's
 * Next.js rewrites route `/projects/*` and `/billing/*` to their own zones,
 * while the prototype's hash router handles them in-process.
 * Every item maps to a page in `access.ts`; it is shown only if the acting role may open that page.
 */
export const NAV: { id: PageId; path: string; icon: (typeof Icons)[keyof typeof Icons]; key: "nav.dashboard" | "nav.projects" | "nav.tasks" | "nav.team" | "nav.availability" | "nav.roles" | "nav.admin" | "nav.users" | "nav.billing" }[] = [
  { id: "dashboard", path: PAGES.dashboard.path, icon: Icons.dashboard, key: "nav.dashboard" },
  { id: "projects", path: PAGES.projects.path, icon: Icons.projects, key: "nav.projects" },
  { id: "tasks", path: PAGES.tasks.path, icon: Icons.tasks, key: "nav.tasks" },
  { id: "team", path: PAGES.team.path, icon: Icons.team, key: "nav.team" },
  { id: "availability", path: PAGES.availability.path, icon: Icons.calendar, key: "nav.availability" },
  { id: "roles", path: PAGES.roles.path, icon: Icons.roles, key: "nav.roles" },
  { id: "users", path: PAGES.users.path, icon: Icons.userPlus, key: "nav.users" },
  { id: "billing", path: PAGES.billing.path, icon: Icons.billing, key: "nav.billing" },
];

function isActive(pathname: string, path: string) {
  if (path === "/") return pathname === "/";
  if (path === "/projects") return pathname === "/projects" || (pathname.startsWith("/projects/") && !pathname.startsWith("/projects/tasks"));
  return pathname === path || pathname.startsWith(path + "/");
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname, navigate, locale, setLocale, session, signOut } = useApp();
  const { t } = useT();
  const can = useCan();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = session?.user;
  const nav = NAV.filter((item) => pageAllowed(can, item.id));

  const NavLink = ({ item, compact }: { item: (typeof NAV)[number]; compact?: boolean }) => {
    const active = isActive(pathname, item.path);
    return (
      <a
        href={item.path}
        onClick={(e) => { e.preventDefault(); navigate(item.path); }}
        aria-current={active ? "page" : undefined}
        title={compact ? t(item.key) : undefined}
        className={cx(
          "flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] font-medium transition-colors duration-150",
          compact && "justify-center px-0",
          active ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-slate-100",
        )}
      >
        <item.icon className={active ? "text-brand-600" : "text-ink-500"} />
        {!compact && <span>{t(item.key)}</span>}
      </a>
    );
  };

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Sidebar (≥ lg) / rail (md) */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[72px] flex-col border-e border-line bg-surface md:flex lg:w-[264px]">
        <div className="flex h-14 items-center gap-2.5 px-3 lg:px-5">
          <Logo />
          <span className="hidden text-[15px] font-bold tracking-tight text-ink-900 lg:block">{t("app.name")}</span>
        </div>
        <nav className="flex-1 space-y-1 px-2 pt-2 lg:px-3" aria-label="Primary">
          {nav.map((item) => (
            <div key={item.id}>
              <div className="hidden lg:block"><NavLink item={item} /></div>
              <div className="lg:hidden"><NavLink item={item} compact /></div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur md:ps-[88px] lg:ps-[288px] sm:px-4 md:pe-6">
        <div className="flex items-center gap-2 md:hidden"><Logo /><span className="font-bold text-ink-900">{t("app.name")}</span></div>
        <div className="relative ms-auto hidden w-full max-w-[420px] sm:block">
          <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ink-400"><Icons.search className="h-4 w-4" /></span>
          <input type="search" placeholder={t("nav.search")} aria-label={t("nav.search")}
            className="h-9 w-full rounded-md border border-line bg-canvas ps-9 pe-3 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:bg-surface focus:shadow-focus" />
        </div>
        <button type="button" onClick={() => setLocale(locale === "en" ? "ar" : "en")} title={t("common.language")}
          className="ms-auto sm:ms-2 inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-700 hover:bg-slate-100">
          <Icons.globe className="h-4 w-4 text-ink-500" /><span>{t("common.language")}</span>
        </button>
        <ThemeToggle />
        <button type="button" className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-500 hover:bg-slate-100" aria-label="Notifications">
          <Icons.bell className="h-5 w-5" /><span className="absolute end-2 top-2 h-1.5 w-1.5 rounded-full bg-danger-600" aria-hidden />
        </button>
        {user && (
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} className="flex items-center gap-2 rounded-md p-1 hover:bg-slate-100">
              <Avatar initials={user.initials} name={user.name} size={30} />
              <span className="hidden text-[13px] font-medium text-ink-900 lg:block">{user.name.split(" ")[0]}</span>
            </button>
            {menuOpen && (
              <div role="menu" className="absolute end-0 top-11 z-40 w-56 animate-rise rounded-lg border border-line bg-surface p-1.5 shadow-pop">
                <div className="px-2.5 py-2"><p className="text-[13px] font-semibold text-ink-900">{user.name}</p><p className="truncate text-[12px] text-ink-500">{user.email}</p></div>
                <button role="menuitem" type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink-700 hover:bg-slate-100">
                  <Icons.logout className="h-4 w-4 text-ink-500" />{t("nav.signOut")}
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Content */}
      <div className="md:ps-[72px] lg:ps-[264px]">
        <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-5 sm:px-6 md:pb-10 lg:px-8 lg:pt-6">
          {children}
        </main>
      </div>

      {/* Bottom tab bar (< md) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }} aria-label="Primary">
        {nav.map((item) => {
          const active = isActive(pathname, item.path);
          return (
            <a key={item.id} href={item.path} onClick={(e) => { e.preventDefault(); navigate(item.path); }} aria-current={active ? "page" : undefined}
              className={cx("flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-brand-700" : "text-ink-500")}>
              <item.icon className={cx("h-[22px] w-[22px]", active && "text-brand-600")} />
              <span className="max-w-full truncate px-0.5">{t(item.key)}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}

/** Light / dark switch; hidden when the host doesn't persist a theme. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle, supported } = useTheme();
  const { t } = useT();
  if (!supported) return null;
  const label = theme === "dark" ? t("common.lightMode") : t("common.darkMode");
  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} aria-pressed={theme === "dark"}
      className={cx("inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900", className)}>
      {theme === "dark" ? <Icons.sun className="h-5 w-5" /> : <Icons.moon className="h-5 w-5" />}
    </button>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect width="28" height="28" rx="7" fill="#1F5FA8" />
      <path d="M7 19 12 13l4 3 5-8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="21" cy="8" r="2" fill="#7CC4FF" />
    </svg>
  );
}
