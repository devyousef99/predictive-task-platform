"use client";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useAuthStore } from "./auth-store";
import { permissionsApi } from "./permissions";

/**
 * The signed-in user's permissions, loaded from the backend after login.
 *
 * Flow (mirrors the shell's DashboardLayout → hydrate → fetchUserPermissions):
 *  1. The app mounts → the cached copy (sessionStorage "ptp.userPermissions") is shown straight away.
 *  2. A fresh copy is fetched in the background and replaces it.
 *  3. A failed fetch keeps the cached copy (or none → screens fall back to the built-in role matrix).
 *  4. Signing out clears it.
 *
 * Source: GET /admin/role-permission/getUserRolePermission/:userId → `granted` (the role's keys; every
 * key for the super admin, none for a disabled user) and `known` (every active key the backend defines).
 */
export type PermissionsStatus = "idle" | "loading" | "loaded" | "error";

interface PermissionsState {
  /** Role the permissions belong to (null for the super admin). */
  roleId: string | null;
  /** Permission keys granted to this user's role. */
  granted: string[];
  /** Every permission key the backend defines (keys outside this list fall back to the role matrix). */
  known: string[];
  /** Whose permissions these are; a different signed-in user ignores and refetches them. */
  userId: string | null;
  loadedAt: number | null;
  status: PermissionsStatus;
  fetchUserPermissions: () => Promise<void>;
  clear: () => void;
}

const empty: Pick<PermissionsState, "roleId" | "granted" | "known" | "userId" | "loadedAt"> = { roleId: null, granted: [], known: [], userId: null, loadedAt: null };

/** Reads the signed-in user's permissions (GET /admin/role-permission/getUserRolePermission/:userId). */
async function loadUserPermissions(): Promise<{ roleId: string | null; granted: string[]; known: string[] }> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error("Not signed in");
  const { roleId, granted, known } = await permissionsApi.getUserPermissions(userId);
  return { roleId, granted: Array.isArray(granted) ? granted : [], known: Array.isArray(known) ? known : [] };
}

let inFlight: Promise<void> | null = null;

export const usePermissionsStore = create<PermissionsState>()(
  persist(
    (set, get) => ({
      ...empty,
      status: "idle",

      fetchUserPermissions: () => {
        if (inFlight) return inFlight;
        const userId = useAuthStore.getState().user?.id ?? null;
        set({ status: "loading" });
        inFlight = loadUserPermissions()
          .then((p) => { console.log("[permissions] loaded", p); set({ ...p, userId, loadedAt: Date.now(), status: "loaded" }); })
          .catch((err: unknown) => {
            console.warn("[permissions] fetch failed; keeping the cached copy", err);
            // Keep the cached copy for the same user; a different user's copy must not be used.
            if (get().userId !== userId) set({ ...empty, status: "error" });
            else set({ status: "error" });
          })
          .finally(() => { inFlight = null; });
        return inFlight;
      },

      clear: () => set({ ...empty, status: "idle" }),
    }),
    {
      name: "ptp.userPermissions",
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      skipHydration: true,
      partialize: ({ roleId, granted, known, userId, loadedAt }) => ({ roleId, granted, known, userId, loadedAt }),
    },
  ),
);

// Signing out (or a 401) clears the permissions with the session.
useAuthStore.subscribe((s, prev) => {
  if (prev.status === "authenticated" && s.status !== "authenticated") usePermissionsStore.getState().clear();
});

/**
 * Loads the cached permissions, then refreshes them in the background while `active` (signed in).
 * Returns the permissions to apply (null → none for this user yet) and whether a first load is still pending.
 */
export function useUserPermissions(active: boolean) {
  const [hydrated, setHydrated] = useState(false);
  const { granted, known, userId, status, loadedAt } = usePermissionsStore();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    const p = usePermissionsStore.persist;
    if (!p || p.hasHydrated()) { setHydrated(true); return; }
    const unsub = p.onFinishHydration(() => setHydrated(true));
    void p.rehydrate();
    return unsub;
  }, []);

  // Every mount of the app (each page load / zone switch) refreshes in the background.
  useEffect(() => {
    if (hydrated && active) void usePermissionsStore.getState().fetchUserPermissions();
  }, [hydrated, active]);

  const mine = loadedAt != null && userId === currentUserId && known.length > 0;
  return {
    permissions: mine ? { granted, known } : null,
    /** True until the first copy for this user is available (cached or fetched) or the fetch has failed. */
    pending: active && (!hydrated || (!mine && status !== "error" && status !== "loaded")),
  };
}
