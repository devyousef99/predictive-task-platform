/**
 * Browser-only persistence for host preferences. Everything lives in sessionStorage (no cookies):
 * it is per-tab and per-origin, and every zone is served through the shell's origin, so all zones
 * in the same tab read the same values. Keys match the prototype host.
 */
export const LOCALE_KEY = "ptp.locale";
export const THEME_KEY = "ptp.theme";
export const ROLE_MATRIX_KEY = "ptp.roleMatrix";

export function readItem(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

export function writeItem(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* storage unavailable (private mode, quota) */ }
}

/** Keys of the old local demo data (users, projects, tasks, board columns, availability). Now all from the API. */
const LEGACY_EXACT = ["ptp.users", "ptp.userOverrides", "ptp.projects", "ptp.memberships", "ptp.tasks"];
const LEGACY_PREFIXES = ["ptp.board", "ptp.availability."];

/** Removes leftover local demo data from this tab's sessionStorage (and from localStorage, where it lived before). */
export function clearLegacyData(): void {
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      const s = store();
      for (const k of Object.keys(s)) {
        if (k === "ptp.availability.project") continue; // the Availability page's selected project (not demo data)
        if (LEGACY_EXACT.includes(k) || LEGACY_PREFIXES.some((p) => k.startsWith(p))) s.removeItem(k);
      }
    } catch { /* storage unavailable */ }
  }
}
