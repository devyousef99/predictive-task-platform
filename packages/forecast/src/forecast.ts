import { addWorkingDays, countWorkingDays, toIsoDate, toUtcDay, type WorkCalendar } from "./calendar";

/** Inputs needed to forecast one task (spec §5.1). */
export interface ForecastInput {
  plannedStart: string; // ISO date
  plannedDue: string; // ISO date
  /** Date the forecast is computed for (defaults to today). */
  asOf?: string;
  /** 0–100 */
  completionPct: number;
  calendar: WorkCalendar;
}

export type HealthStatus = "on-track" | "at-risk" | "delayed" | "not-started" | "completed";

export interface ForecastResult {
  /** 1. Planned Working Days */
  pwd: number;
  /** 2. Planned Velocity — % per working day */
  pv: number;
  /** 3. Actual Working Days Elapsed */
  awde: number;
  /** 4. Working-Day Actual Velocity — % per working day (null before any working day elapses) */
  wdav: number | null;
  /** 5. Remaining Estimated Working Days (null when velocity is unknown / zero) */
  rewd: number | null;
  /** 6. Forecasted Completion Date (ISO) */
  fcd: string | null;
  /** 7. Working-Day Delay Variance: positive = late, negative = early */
  wddv: number | null;
  /** Remaining planned working days from asOf to plannedDue */
  remainingPlannedDays: number;
  /** Expected completion % at asOf if on plan */
  expectedPct: number;
  health: HealthStatus;
}

/**
 * Thresholds for the health indicator (spec §6.1):
 * green = on track, yellow = at risk, red = delayed.
 * A task is "at risk" when it will finish late by ≤ AT_RISK_DAYS working days
 * or when actual velocity has slipped below 85% of planned velocity.
 */
export const AT_RISK_DAYS = 2;
export const VELOCITY_RISK_RATIO = 0.85;

export function forecastTask(input: ForecastInput): ForecastResult {
  const { calendar } = input;
  const start = toUtcDay(input.plannedStart);
  const due = toUtcDay(input.plannedDue);
  const asOf = toUtcDay(input.asOf ?? toIsoDate(new Date()));
  const pct = clamp(input.completionPct, 0, 100);

  // 1. PWD — inclusive count of active working days between start and due.
  const pwd = countWorkingDays(start, due, calendar);
  // 2. PV
  const pv = pwd > 0 ? 100 / pwd : 0;
  // 3. AWDE — working days from start through asOf (capped at 0 before start).
  const awde = asOf < start ? 0 : countWorkingDays(start, asOf, calendar);
  // Remaining planned days after asOf.
  const remainingPlannedDays = Math.max(0, pwd - awde);
  const expectedPct = clamp(pv * awde, 0, 100);

  if (pct >= 100) {
    return {
      pwd, pv, awde, wdav: awde > 0 ? 100 / awde : null, rewd: 0,
      fcd: toIsoDate(asOf), wddv: -remainingPlannedDays, remainingPlannedDays,
      expectedPct, health: "completed",
    };
  }

  if (awde === 0) {
    return {
      pwd, pv, awde, wdav: null, rewd: null, fcd: null, wddv: null,
      remainingPlannedDays, expectedPct, health: "not-started",
    };
  }

  // 4. WD-AV
  const wdav = pct / awde;
  if (wdav <= 0) {
    // No progress after work has started: cannot project, but it is clearly delayed.
    return {
      pwd, pv, awde, wdav: 0, rewd: null, fcd: null, wddv: null,
      remainingPlannedDays, expectedPct, health: "delayed",
    };
  }

  // 5. REWD
  const rewd = (100 - pct) / wdav;
  // 6. FCD — project REWD working days forward from asOf along the calendar.
  const fcdDate = addWorkingDays(asOf, rewd, calendar);
  // 7. WD-DV — working days between planned due and forecast (sign = late/early).
  const wddv = (fcdDate > due
    ? countWorkingDays(due, fcdDate, calendar) - 1 // exclude the due day itself
    : -(countWorkingDays(fcdDate, due, calendar) - 1)) || 0; // normalise -0

  let health: HealthStatus = "on-track";
  if (wddv > AT_RISK_DAYS) health = "delayed";
  else if (wddv > 0 || wdav < pv * VELOCITY_RISK_RATIO) health = "at-risk";

  return {
    pwd, pv, awde, wdav, rewd, fcd: toIsoDate(fcdDate), wddv,
    remainingPlannedDays, expectedPct, health,
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Convenience: round to 1 decimal for display. */
export const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
