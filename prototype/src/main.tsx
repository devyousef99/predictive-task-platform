import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { useAuthHydrated, useAuthStore, useUserPermissions } from "@ptp/api";
import type { Locale } from "@ptp/i18n";
import { dirOf } from "@ptp/i18n";
import { DEFAULT_ROLE_MATRIX, decodeRoleMatrix, encodeRoleMatrix, isSuperAdminRole, type ProjectRole, type RoleMatrix } from "@ptp/rbac";
import { AppProvider, Router, applyThemeClass, landingPath, makeSession, todayISO, type AppHost, type Session, type Theme } from "@ptp/ui";
import "@ptp/ui/styles.css";

/**
 * Prototype host: hash-based routing + in-memory session.
 * In production each Next.js zone provides the same AppHost contract (see apps/*).
 */
function useHashPath() {
  const read = () => (location.hash.replace(/^#/, "") || "/");
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return [path, (p: string) => { location.hash = p; scrollTo({ top: 0 }); }] as const;
}

function initialTheme(): Theme {
  try {
    const saved = sessionStorage.getItem("ptp.theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* ignore */ }
  return matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function App() {
  const [pathname, navigate] = useHashPath();
  const [locale, setLocaleState] = useState<Locale>(() => { try { return (sessionStorage.getItem("ptp.locale") as Locale) || "en"; } catch { return "en"; } });
  const [session, setSession] = useState<Session | null>(null);
  const [roleMatrix, setRoleMatrixState] = useState<RoleMatrix>(() => { try { return decodeRoleMatrix(sessionStorage.getItem("ptp.roleMatrix")) ?? DEFAULT_ROLE_MATRIX; } catch { return DEFAULT_ROLE_MATRIX; } });
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirOf(locale);
    try { sessionStorage.setItem("ptp.locale", locale); } catch { /* ignore */ }
  }, [locale]);
  useEffect(() => { applyThemeClass(theme); }, [theme]);

  // Restore the session from the persisted auth store so a refresh keeps the user on the current page.
  const authReady = useAuthHydrated();
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!authReady) return;
    const { status, user, expiresAt, logout } = useAuthStore.getState();
    if (status === "authenticated" && user) {
      if (!expiresAt || expiresAt > Date.now()) setSession(makeSession({ id: user.id, email: user.email }, user.role, isSuperAdminRole(user.backendRole)));
      else logout(); // token expired → back to sign-in
    }
    setRestored(true);
  }, [authReady]);

  // Sign out when the backend token expires while the page is open.
  const tokenExpiresAt = useAuthStore((s) => (s.status === "authenticated" ? s.expiresAt : null));
  useEffect(() => {
    if (!session || !tokenExpiresAt) return;
    const id = window.setTimeout(() => { useAuthStore.getState().logout(); setSession(null); navigate("/login"); }, Math.max(0, Math.min(tokenExpiresAt - Date.now(), 2 ** 31 - 1)));
    return () => window.clearTimeout(id);
  }, [session, tokenExpiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Backend permissions for the signed-in user (cached copy first, refreshed in the background).
  const { permissions, pending: permissionsPending } = useUserPermissions(!!session);
  const effective = useMemo(() => (session && permissions ? { ...session, principal: { ...session.principal, permissions } } : session), [session, permissions]);

  const host: AppHost = useMemo(() => ({
    locale, setLocale: setLocaleState, pathname, navigate, session: effective, permissionsPending, today: todayISO(), roleMatrix, theme,
    setTheme: (t) => { try { sessionStorage.setItem("ptp.theme", t); } catch { /* ignore */ } setThemeState(t); },
    setRoleMatrix: (m) => { try { sessionStorage.setItem("ptp.roleMatrix", encodeRoleMatrix(m)); } catch { /* ignore */ } setRoleMatrixState(m); },
    signIn: async (email, role) => { const u = useAuthStore.getState().user; const s = makeSession({ id: u?.id ?? "", email }, role, isSuperAdminRole(u?.backendRole)); setSession(s); navigate(landingPath(s.principal, roleMatrix)); },
    signOut: () => { useAuthStore.getState().logout(); setSession(null); navigate("/login"); },
    switchRole: (role: ProjectRole) => setSession((s) => (s ? { ...s, principal: { ...s.principal, orgRole: role === "owner" ? "org_owner" : role === "pm" ? "org_admin" : "org_member", defaultRole: role } } : s)),
  }), [locale, pathname, effective, permissionsPending, roleMatrix, theme]);

  if (!restored) return null; // avoid flashing the login screen while the session is restored
  return <AppProvider host={host}><Router /></AppProvider>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
