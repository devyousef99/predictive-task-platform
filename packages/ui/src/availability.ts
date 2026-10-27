
/**
 * Availability / time-slot mechanism.
 * A config holds: the working-week range (startDay..endDay), a per-weekday rule (hours / day off),
 * an optional break window, and per-date exceptions. An exception is what actually persists for a
 * calendar day and carries an explicit slot list so manual edits and on/off toggles survive reload.
 * Days without an exception show no slots until the user generates them (day / week / month).
 * All dates are ISO "YYYY-MM-DD" strings handled in UTC so server and client agree.
 */
export interface BreakTime { start: string; end: string }
export interface Slot { start: string; end: string; active: boolean }
export interface WeeklyRule { dayOfWeek: number; isDayOff: boolean; workStart: string; workEnd: string }
export interface DateException { date: string; isDayOff: boolean; workStart?: string; workEnd?: string; slots?: Slot[] }
export interface AvailabilityConfig {
  userId: string;
  slotDurationMinutes: number;
  breakTime: BreakTime;
  startDay: number; // 0=Sun … 6=Sat — first working day of the week
  endDay: number;   // 0=Sun … 6=Sat — last working day of the week
  weeklyRules: WeeklyRule[];
  exceptions: DateException[];
  savedAt: string;
}

export const SLOT_MINUTES = 30;
export const WEEKEND_DAYS = [5, 6];
export const NO_BREAK: BreakTime = { start: "00:00", end: "00:00" };
export const DEFAULT_HOURS = { start: "09:00", end: "17:00" };
export const DEFAULT_WEEKLY_RULES: WeeklyRule[] = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dayOfWeek: dow, isDayOff: WEEKEND_DAYS.includes(dow), workStart: DEFAULT_HOURS.start, workEnd: DEFAULT_HOURS.end }));

/* ─── Dates (UTC, ISO strings) ───────────────────────────────────────────── */
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const formatDateKey = (d: Date) => d.toISOString().slice(0, 10);
export const dayOfWeek = (iso: string) => toDate(iso).getUTCDay();
export const addDays = (iso: string, n: number) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return formatDateKey(d); };
export const startOfWeek = (iso: string) => addDays(iso, -dayOfWeek(iso));
export const getWeekDates = (iso: string) => { const s = startOfWeek(iso); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); };
export function getMonthDates(iso: string) {
  const d = toDate(iso);
  const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => formatDateKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), i + 1))));
}
export const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

/* ─── Times ──────────────────────────────────────────────────────────────── */
export function timeToMinutes(time: string) { const [h, m] = time.split(":").map(Number); return h * 60 + m; }
export function minutesToTime(mins: number) { const h = Math.floor(mins / 60) % 24; const m = mins % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => minutesToTime(i * 30));
export const START_TIME_OPTIONS = TIME_OPTIONS.filter((t) => t >= "06:00");

/** Slots inside the break window stay in the list but are marked inactive (greyed / not bookable). */
export function generateSlots(workStart: string, workEnd: string, breakTime?: BreakTime): Slot[] {
  const startMin = timeToMinutes(workStart);
  let endMin = timeToMinutes(workEnd);
  if (endMin <= startMin) endMin += 24 * 60;
  const bs = breakTime ? timeToMinutes(breakTime.start) : null;
  const be = breakTime ? timeToMinutes(breakTime.end) : null;
  const slots: Slot[] = [];
  for (let t = startMin; t + SLOT_MINUTES <= endMin; t += SLOT_MINUTES) {
    const inBreak = bs !== null && be !== null && t >= bs && t < be;
    slots.push({ start: minutesToTime(t), end: minutesToTime(t + SLOT_MINUTES), active: !inBreak });
  }
  return slots;
}

export function isWithinWorkingWeek(dow: number, startDay: number, endDay: number) {
  if (startDay <= endDay) return dow >= startDay && dow <= endDay;
  return dow >= startDay || dow <= endDay; // wraps around e.g. Sat→Wed
}

export const ruleFor = (rules: WeeklyRule[], dow: number) => rules.find((r) => r.dayOfWeek === dow) ?? DEFAULT_WEEKLY_RULES[dow];

/** A weekend day outside the range can still be enabled via its weekly rule (isDayOff=false). */
export function isWeekendEnabled(dow: number, rules: WeeklyRule[], startDay: number, endDay: number) {
  return !isWithinWorkingWeek(dow, startDay, endDay) && WEEKEND_DAYS.includes(dow) && ruleFor(rules, dow).isDayOff === false;
}

export function resolveDay(dateKey: string, rules: WeeklyRule[], exceptions: DateException[], startDay: number, endDay: number) {
  const dow = dayOfWeek(dateKey);
  const inRange = isWithinWorkingWeek(dow, startDay, endDay);
  const weekendEnabled = isWeekendEnabled(dow, rules, startDay, endDay);
  // Days outside the configured range are off — unless a weekend day is explicitly enabled.
  if (!inRange && !weekendEnabled) return { isDayOff: true, outsideRange: true, workStart: DEFAULT_HOURS.start, workEnd: DEFAULT_HOURS.end };
  const exc = exceptions.find((e) => e.date === dateKey);
  const rule = ruleFor(rules, dow);
  // A just-enabled weekend day should not stay off due to a stale day-off exception — rule wins.
  if (exc && !(weekendEnabled && exc.isDayOff)) {
    return { isDayOff: exc.isDayOff, outsideRange: false, workStart: exc.workStart ?? DEFAULT_HOURS.start, workEnd: exc.workEnd ?? DEFAULT_HOURS.end };
  }
  // In-range days are working days by default; an out-of-range weekend day that reached here is enabled.
  return { isDayOff: inRange ? false : rule.isDayOff, outsideRange: false, workStart: rule.workStart, workEnd: rule.workEnd };
}

/** Merge incoming exceptions (by date) into the base list, replacing same-date entries. */
export function mergeExceptions(base: DateException[], incoming: DateException[]) {
  const byDate = new Map(base.map((e) => [e.date, e]));
  incoming.forEach((e) => byDate.set(e.date, e));
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** What the API's partial update did: overwrite scalar fields, clear a date window, then merge exceptions. */
export type ConfigUpdate = Partial<Omit<AvailabilityConfig, "exceptions">> & { exceptions?: DateException[]; clearExceptionsFrom?: string; clearExceptionsTo?: string };
export function applyConfigUpdate(cfg: AvailabilityConfig, u: ConfigUpdate): AvailabilityConfig {
  const { exceptions, clearExceptionsFrom, clearExceptionsTo, ...rest } = u;
  let excs = cfg.exceptions;
  if (clearExceptionsFrom && clearExceptionsTo) excs = excs.filter((e) => e.date < clearExceptionsFrom || e.date > clearExceptionsTo);
  if (exceptions) excs = mergeExceptions(excs, exceptions);
  return { ...cfg, ...rest, exceptions: excs };
}
