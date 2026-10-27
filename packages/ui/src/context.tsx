"use client";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { dictionaries, dirOf, interpolate, type Dictionary, type Locale } from "@ptp/i18n";
import { DEFAULT_ROLE_MATRIX, can, type Permission, type Principal, type ProjectRole, type RoleMatrix } from "@ptp/rbac";

/**
 * Host-agnostic app context. Each micro-frontend (Next.js zone) and the prototype
 * provide navigation + session; feature screens never import a router directly.
 */
export interface Session {
  principal: Principal;
  user: { id: string; name: string; email: string; initials: string };
  orgName: string;
}

export type Theme = "light" | "dark";

export interface AppHost {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Colour theme; hosts persist it and toggle the `dark` class on <html>. Defaults to light when omitted. */
  theme?: Theme;
  setTheme?: (t: Theme) => void;
  pathname: string;
  navigate: (path: string) => void;
  session: Session | null;
  /** Starts the app session once the backend has verified the user (login + emailed code). `token` is the backend JWT. */
  signIn: (email: string, role: ProjectRole, token?: string) => Promise<void>;
  signOut: () => void;
  /** Switch the acting role for the current tab without signing in again. */
  switchRole?: (role: ProjectRole) => void;
  /** True while the signed-in user's permissions are loading for the first time (pages wait instead of showing "no access"). */
  permissionsPending?: boolean;
  /** Active role → permission matrix. Omit to use the built-in defaults. */
  roleMatrix?: RoleMatrix;
  /** Persist an admin-customized matrix; hosts decide where (sessionStorage, API). */
  setRoleMatrix?: (matrix: RoleMatrix) => void;
  /** "Today" (YYYY-MM-DD) in the browser's time zone; injectable so tests are deterministic. */
  today: string;
}

const Ctx = createContext<AppHost | null>(null);

export function AppProvider({ host, children }: { host: AppHost; children: ReactNode }) {
  return <Ctx.Provider value={host}>{children}</Ctx.Provider>;
}

export function useApp(): AppHost {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}

type Path<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Path<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TKey = Path<Dictionary>;

export function useT() {
  const { locale } = useApp();
  const dict = dictionaries[locale];
  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => {
      const raw = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dict);
      return interpolate(typeof raw === "string" ? raw : key, vars);
    },
    [dict],
  );
  return useMemo(() => ({ t, locale, dir: dirOf(locale), dict }), [t, locale, dict]);
}

export function useSession(): Session {
  const { session } = useApp();
  if (!session) throw new Error("No session");
  return session;
}

/** Current theme plus a toggler; a no-op toggler when the host doesn't support themes. */
export function useTheme(): { theme: Theme; toggle: () => void; supported: boolean } {
  const { theme = "light", setTheme } = useApp();
  return { theme, toggle: () => setTheme?.(theme === "dark" ? "light" : "dark"), supported: !!setTheme };
}

/** Apply a theme to the document (shared by every host). */
export function applyThemeClass(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** The matrix in force for this host (admin overrides applied, defaults otherwise). */
export function useRoleMatrix(): RoleMatrix {
  return useApp().roleMatrix ?? DEFAULT_ROLE_MATRIX;
}

/** Permission check bound to the current session and the active matrix. Returns false when signed out. */
export function useCan(): (permission: Permission, projectId?: string) => boolean {
  const { session } = useApp();
  const matrix = useRoleMatrix();
  return useCallback(
    (permission: Permission, projectId?: string) => (session ? can(session.principal, permission, projectId, matrix) : false),
    [session, matrix],
  );
}
