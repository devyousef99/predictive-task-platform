"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuthHydrated, useAuthStore, usePermissionsStore, useUserPermissions } from "@ptp/api";
import { dirOf, type Locale } from "@ptp/i18n";
import { DEFAULT_ROLE_MATRIX, decodeRoleMatrix, encodeRoleMatrix, isSuperAdminRole, type ProjectRole, type RoleMatrix } from "@ptp/rbac";
import { AppProvider, applyThemeClass, landingPath, makeSession, todayISO, type AppHost, type Session, type Theme } from "@ptp/ui";
import { LOCALE_KEY, ROLE_MATRIX_KEY, THEME_KEY, clearLegacyData, readItem, writeItem } from "./storage";
import { zoneFor, type ZoneId } from "./zones";

/**
 * Adapts the Next.js router + the sessionStorage-backed auth store to the host contract the UI
 * package expects. Every zone wraps its root layout with this; `zone` tells it which paths are
 * in-process. There are no cookies: the session, locale, theme and role matrix are read in the
 * browser, so nothing renders until they are loaded (no flash of the wrong page or theme).
 */
export function NextHost({ zone, basePath = "", children }: { zone: ZoneId; basePath?: string; children: ReactNode }) {
  const router = useRouter();
  const nextPath = usePathname();
  // Public path = basePath + zone-relative path (Next strips basePath from usePathname()).
  const pathname = (basePath + (nextPath === "/" && basePath ? "" : nextPath)) || "/";

  const [prefsReady, setPrefsReady] = useState(false);
  const [locale, setLocaleState] = useState<Locale>("en");
  const [roleMatrix, setRoleMatrixState] = useState<RoleMatrix>(DEFAULT_ROLE_MATRIX);
  const [theme, setThemeState] = useState<Theme>("light");
  const [today, setToday] = useState(() => todayISO());

  // Load saved preferences once in the browser. No saved theme → follow the OS preference.
  useEffect(() => {
    const l = readItem(LOCALE_KEY);
    if (l === "ar" || l === "en") setLocaleState(l);
    const t = readItem(THEME_KEY);
    setThemeState(t === "dark" || t === "light" ? t : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setRoleMatrixState(decodeRoleMatrix(readItem(ROLE_MATRIX_KEY)) ?? DEFAULT_ROLE_MATRIX);
    setToday(todayISO()); // the browser's date, not the server's
    clearLegacyData();
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirOf(locale);
  }, [locale]);
  useEffect(() => { if (prefsReady) applyThemeClass(theme); }, [prefsReady, theme]);

  // Session = the verified login in the shared auth store (sessionStorage), while its JWT is valid.
  const authReady = useAuthHydrated();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  // The user's permissions from the backend: cached copy first, refreshed in the background.
  const { permissions, pending: permissionsPending } = useUserPermissions(authReady && status === "authenticated");
  const session: Session | null = useMemo(
    () => (status === "authenticated" && user && (!expiresAt || expiresAt > Date.now())
      ? makeSession({ id: user.id, email: user.email }, user.role, isSuperAdminRole(user.backendRole), permissions)
      : null),
    [status, user, expiresAt, permissions],
  );

  // End the session when the backend JWT expires (also covers a token that expired while the tab was closed).
  useEffect(() => {
    if (!authReady || status !== "authenticated" || !expiresAt) return;
    const signOutNow = () => { useAuthStore.getState().logout(); window.location.assign("/login"); };
    const ms = expiresAt - Date.now();
    if (ms <= 0) { signOutNow(); return; }
    const id = window.setTimeout(signOutNow, Math.min(ms, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [authReady, status, expiresAt]);

  const host: AppHost = useMemo(() => ({
    locale, pathname, session, today, roleMatrix, theme, permissionsPending,
    setLocale: (l) => { writeItem(LOCALE_KEY, l); setLocaleState(l); },
    setTheme: (t) => { writeItem(THEME_KEY, t); setThemeState(t); },
    // Admin overrides for page gating are kept per tab until an org-settings API exists.
    setRoleMatrix: (m) => { writeItem(ROLE_MATRIX_KEY, encodeRoleMatrix(m)); setRoleMatrixState(m); },
    navigate: (path) => {
      if (zoneFor(path) === zone) router.push(basePath ? path.slice(basePath.length) || "/" : path);
      else window.location.assign(path); // cross-zone: hard navigation
    },
    // The auth store is already "authenticated" once the emailed code is verified; just go home.
    signIn: async (email, role) => {
      // Load the user's permissions before choosing their home page (gives up after 5 s and uses the role matrix).
      await Promise.race([usePermissionsStore.getState().fetchUserPermissions(), new Promise((r) => setTimeout(r, 5000))]);
      const u = useAuthStore.getState().user;
      const p = usePermissionsStore.getState();
      const loaded = p.loadedAt != null && p.userId === (u?.id ?? null) && p.known.length > 0 ? { granted: p.granted, known: p.known } : null;
      const next = makeSession({ id: u?.id ?? "", email }, role, isSuperAdminRole(u?.backendRole), loaded);
      window.location.assign(landingPath(next.principal, roleMatrix)); // role-based home page
    },
    signOut: () => {
      useAuthStore.getState().logout();
      window.location.assign("/login");
    },
    switchRole: (role: ProjectRole) => {
      useAuthStore.setState((s) => (s.user ? { user: { ...s.user, role } } : {}));
    },
  }), [locale, pathname, session, today, roleMatrix, theme, permissionsPending, zone, basePath, router]);

  if (!prefsReady || !authReady) return null;
  return <AppProvider host={host}>{children}</AppProvider>;
}

/**
 * Inline snippet for <head>: applies the saved theme (or the OS preference) and language direction
 * from sessionStorage before first paint, so there is no light or LTR flash. Keep keys in sync with storage.ts.
 */
export const BOOT_SCRIPT = `(function(){try{var d=document.documentElement,s=sessionStorage,t=s.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(t==='dark')d.classList.add('dark');if(s.getItem('${LOCALE_KEY}')==='ar'){d.lang='ar';d.dir='rtl';}}catch(e){}})();`;
