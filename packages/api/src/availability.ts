import { ApiError, apiRequest } from "./client";
// Registers the auth store's token provider with the client, so every call here sends the bearer token.
import "./auth-store";

/** "HH:mm" */
export type HHmm = string;
export interface AvailabilityBreak { start: HHmm; end: HHmm }
export interface AvailabilitySlot { start: HHmm; end: HHmm; active: boolean }
export interface AvailabilityException {
  date: string; // YYYY-MM-DD
  isDayOff: boolean;
  workStart?: HHmm;
  workEnd?: HHmm;
  slots?: AvailabilitySlot[];
}

/** Saved per-project config (GET getAvailabilityConfigByProject). Days: 0 = Sun … 6 = Sat. */
export interface AvailabilityConfigDto {
  _id: string;
  projectID: string;
  startDay: number;
  endDay: number;
  workStart: HHmm;
  workEnd: HHmm;
  breakTime: AvailabilityBreak | null;
  slotDurationMinutes: number;
  weeklyRules?: unknown[];
  exceptions?: AvailabilityException[];
}

/** One day of GET getAvailabilitySlots. */
export interface AvailabilityDay {
  date: string;
  dayOfWeek: number;
  dayOff: boolean;
  workStart: HHmm | null;
  workEnd: HHmm | null;
  source?: string;
  /** false → "No slots" (slots then only holds a preview). */
  hasSavedSlots: boolean;
  slots: AvailabilitySlot[];
}

export interface UpsertAvailabilityBody {
  projectID: string;
  startDay: number;
  endDay: number;
  workStart: HHmm;
  workEnd: HHmm;
  slotDurationMinutes: number;
  breakTime: AvailabilityBreak | null;
}

/** PUT updateAvailabilityConfig body: any combination of these. */
export interface UpdateAvailabilityBody {
  startDay?: number;
  endDay?: number;
  workStart?: HHmm;
  workEnd?: HHmm;
  breakTime?: AvailabilityBreak | null;
  exception?: AvailabilityException;
  exceptions?: AvailabilityException[];
  clearExceptionsFrom?: string;
  clearExceptionsTo?: string;
}

const BASE = "/admin/availability";

/** "This project has no availability config yet": a 404, or any error whose message says "not found". */
export function isAvailabilityNotFound(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || /not\s*found/i.test(err.messageEn));
}
const id = (v: string) => encodeURIComponent(v);

/** Per-project availability endpoints (bearer token added automatically). */
export const availabilityApi = {
  /** The project's config, or null when it has none yet (404 → show the defaults). */
  getConfig: async (projectID: string, signal?: AbortSignal): Promise<AvailabilityConfigDto | null> => {
    try {
      return (await apiRequest<AvailabilityConfigDto>(`${BASE}/getAvailabilityConfigByProject/${id(projectID)}`, { signal })) ?? null;
    } catch (err) {
      if (isAvailabilityNotFound(err)) return null;
      throw err;
    }
  },

  /** Creates the config, or replaces the existing one. */
  upsertConfig: (body: UpsertAvailabilityBody) =>
    apiRequest<unknown>(`${BASE}/upsertAvailabilityConfig`, { method: "POST", body }),

  /** Day cards for a date range (inclusive, max 62 days). */
  getSlots: async (projectID: string, from: string, to: string, signal?: AbortSignal): Promise<AvailabilityDay[]> => {
    const data = await apiRequest<unknown>(`${BASE}/getAvailabilitySlots/${id(projectID)}?from=${from}&to=${to}`, { signal });
    if (Array.isArray(data)) return data as AvailabilityDay[];
    const o = (data ?? {}) as { days?: unknown; items?: unknown };
    return (Array.isArray(o.days) ? o.days : Array.isArray(o.items) ? o.items : []) as AvailabilityDay[];
  },

  /** Partial update (hours/days/break, one day, or a cleared range of days). 200 with no data → refetch. */
  updateConfig: (configId: string, body: UpdateAvailabilityBody) =>
    apiRequest<unknown>(`${BASE}/updateAvailabilityConfig/${id(configId)}`, { method: "PUT", body }),
};
