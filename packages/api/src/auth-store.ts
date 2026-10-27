"use client";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { PROJECT_ROLES, type ProjectRole } from "@ptp/rbac";
import { authApi } from "./auth";
import { configureApiClient } from "./client";

/** How long an emailed code stays valid, per the API docs. */
export const OTP_TTL_MS = 2 * 60 * 1000;
/** Minimum wait between resend requests. */
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const TOKEN_TTL_MS = 60 * 60 * 1000;

export type AuthStatus = "signedOut" | "pendingOtp" | "authenticated";

export interface AuthUser {
  id: string;
  email: string;
  /** Role exactly as the backend sent it. */
  backendRole: string;
  /** Backend role mapped onto the app's RBAC roles. */
  role: ProjectRole;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Bearer token. While `pendingOtp` it is the pre-verification token and is not sent automatically. */
  token: string | null;
  /** Epoch ms when the token expires (from the JWT `exp`, else 60 min after issue). */
  expiresAt: number | null;
  /** Epoch ms when the latest code was emailed; drives the expiry countdown and resend cooldown. */
  otpSentAt: number | null;

  login: (username: string, password: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<AuthUser>;
  /** DEMO ONLY (see SKIP_OTP): treat the pending login as verified without the emailed code. */
  skipOtp: () => AuthUser;
  resendOtp: () => Promise<void>;
  logout: () => void;
}

const signedOut = { status: "signedOut", user: null, token: null, expiresAt: null, otpSentAt: null } as const;

/**
 * Shared auth store and the app's only session (no cookies). Persisted to sessionStorage, so every
 * zone served through the shell (same origin) reads the same token within a tab; closing the tab
 * signs out. Import `useAuthStore` anywhere, or `useAuthStore.getState()`
 * outside React.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...signedOut,

      login: async (email, password) => {
        const data = await authApi.login(email.trim(), password);
        set({
          status: "pendingOtp",
          user: { id: String(data.id), email: email.trim(), backendRole: data.role, role: toProjectRole(data.role) },
          token: data.token,
          expiresAt: tokenExpiry(data.token),
          otpSentAt: Date.now(),
        });
      },

      verifyOtp: async (code) => {
        const { user, token, status } = get();
        if (status !== "pendingOtp" || !user) throw new Error("No sign-in in progress");
        const data = await authApi.verifyMailCode(user.email, code, token);
        const nextToken = data?.token ?? token;
        const nextUser: AuthUser = data?.role ? { ...user, backendRole: data.role, role: toProjectRole(data.role) } : user;
        set({ status: "authenticated", user: nextUser, token: nextToken, expiresAt: nextToken ? tokenExpiry(nextToken) : null, otpSentAt: null });
        return nextUser;
      },

      skipOtp: () => {
        const { user, status } = get();
        if (status !== "pendingOtp" || !user) throw new Error("No sign-in in progress");
        set({ status: "authenticated", otpSentAt: null }); // keeps the login token
        return user;
      },

      resendOtp: async () => {
        const { user } = get();
        if (!user) throw new Error("No sign-in in progress");
        await authApi.resendMailCode(user.email);
        set({ otpSentAt: Date.now() });
      },

      logout: () => set(signedOut),
    }),
    {
      name: "ptp.auth",
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      // Rehydrated on the client by useAuthHydrated(), so server and first client render match.
      skipHydration: true,
      partialize: ({ status, user, token, expiresAt, otpSentAt }) => ({ status, user, token, expiresAt, otpSentAt }),
    },
  ),
);

// Authenticated requests pick up the token automatically; a 401 signs the user out.
configureApiClient({
  getToken: () => {
    const { status, token, expiresAt } = useAuthStore.getState();
    return status === "authenticated" && token && (!expiresAt || expiresAt > Date.now()) ? token : null;
  },
  onUnauthorized: () => useAuthStore.getState().logout(),
});

/** Loads the persisted auth state once on the client; returns true when it's ready to read. */
export function useAuthHydrated(): boolean {
  // Starts false on both server and client so the first render matches the server HTML.
  // `persist` is only attached where sessionStorage exists, i.e. never during SSR.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const p = useAuthStore.persist;
    if (!p || p.hasHydrated()) { setHydrated(true); return; }
    const unsub = p.onFinishHydration(() => setHydrated(true));
    void p.rehydrate();
    return unsub;
  }, []);
  return hydrated;
}

/** Maps the backend's role string onto an RBAC role; unknown roles get the least-privileged one. */
export function toProjectRole(role: string | null | undefined): ProjectRole {
  const r = String(role ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if ((PROJECT_ROLES as readonly string[]).includes(r)) return r as ProjectRole;
  if (["admin", "super_admin", "project_owner", "org_owner"].includes(r)) return "owner";
  if (["manager", "project_manager", "org_admin"].includes(r)) return "pm";
  if (["member", "user", "task_contributor", "employee"].includes(r)) return "contributor";
  if (["quality_lead", "qa", "reviewer_quality_lead"].includes(r)) return "reviewer";
  return "stakeholder";
}

/** Reads the JWT `exp` claim (seconds) without verifying it; the backend does the verification. */
function tokenExpiry(token: string): number {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload)) as { exp?: number };
    if (typeof exp === "number") return exp * 1000;
  } catch { /* fall through */ }
  return Date.now() + TOKEN_TTL_MS;
}
