/**
 * Working-calendar engine.
 * Every duration in the platform is measured in *active working days* only:
 * weekends and configured holidays are never counted (spec §4.2, §5).
 */

/** 0 = Sunday … 6 = Saturday (JS Date convention). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WorkCalendar {
  id: string;
  name: string;
  /** Days of the week that count as working days. */
  workingDays: Weekday[];
  /** Working hours per day, used for capacity/over-allocation checks. */
  hoursPerDay: number;
  /** ISO dates (YYYY-MM-DD) that are non-working even if on a working weekday. */
  holidays: string[];
}

export const CALENDAR_TEMPLATES: Record<"sun-thu" | "mon-fri", WorkCalendar> = {
  "sun-thu": {
    id: "sun-thu",
    name: "Sunday – Thursday",
    workingDays: [0, 1, 2, 3, 4],
    hoursPerDay: 8,
    holidays: [],
  },
  "mon-fri": {
    id: "mon-fri",
    name: "Monday – Friday",
    workingDays: [1, 2, 3, 4, 5],
    hoursPerDay: 8,
    holidays: [],
  },
};

/** Normalise to a UTC midnight Date so day arithmetic is timezone-safe. */
export function toUtcDay(input: Date | string): Date {
  if (typeof input === "string") {
    const [y, m, d] = input.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export function isWorkingDay(date: Date | string, cal: WorkCalendar): boolean {
  const d = toUtcDay(date);
  const dow = d.getUTCDay() as Weekday;
  if (!cal.workingDays.includes(dow)) return false;
  return !cal.holidays.includes(toIsoDate(d));
}

/**
 * Count active working days in the inclusive range [start, end].
 * Returns 0 when end < start.
 */
export function countWorkingDays(start: Date | string, end: Date | string, cal: WorkCalendar): number {
  let cur = toUtcDay(start);
  const stop = toUtcDay(end);
  if (stop < cur) return 0;
  let n = 0;
  while (cur <= stop) {
    if (isWorkingDay(cur, cal)) n++;
    cur = addDays(cur, 1);
  }
  return n;
}

/**
 * Move forward `workingDays` active days from `from` (exclusive of `from`),
 * skipping non-working days and holidays. `workingDays` may be fractional;
 * it is rounded up because a partial day still needs a calendar day.
 */
export function addWorkingDays(from: Date | string, workingDays: number, cal: WorkCalendar): Date {
  let remaining = Math.ceil(Math.max(0, workingDays));
  let cur = toUtcDay(from);
  if (remaining === 0) return cur;
  // Guard against a calendar with no working days.
  if (cal.workingDays.length === 0) throw new Error("Calendar has no working days");
  while (remaining > 0) {
    cur = addDays(cur, 1);
    if (isWorkingDay(cur, cal)) remaining--;
  }
  return cur;
}
