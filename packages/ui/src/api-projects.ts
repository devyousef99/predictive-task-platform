"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError, projectsApi } from "@ptp/api";
import type { HealthStatus, Weekday } from "@ptp/forecast";
import { CALENDARS, WEEKDAYS, initialsOf, makeProjectCost, type ProjectCost } from "./models";

/** One row of the projects list, as loaded from GET admin/projects/getAllProjects. */
export interface ProjectSummary {
  id: string;
  title: string;
  category: string;
  ownerId: string | null;
  ownerName: string;
  workingDays: Weekday[];
  plannedStart: string | null;
  plannedDue: string | null;
  cost: ProjectCost;
  members: { id: string; name: string; initials: string; index: number }[];
  progress: number;
  health: HealthStatus;
}

type Obj = Record<string, unknown>;
const HEALTH: HealthStatus[] = ["on-track", "at-risk", "delayed", "not-started", "completed"];
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (...vs: unknown[]) => { for (const v of vs) if (typeof v === "string" && v.trim()) return v.trim(); return undefined; };
const num = (...vs: unknown[]) => { for (const v of vs) { const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v; if (typeof n === "number" && Number.isFinite(n)) return n; } return undefined; };
const idOf = (...vs: unknown[]) => { for (const v of vs) if ((typeof v === "string" && v) || typeof v === "number") return String(v); return undefined; };
const isoDate = (v: unknown) => { const s = str(v); return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };

/** Unwraps the list from `data`: a bare array, or `{ items | projects | data | rows: [...] }`. */
export function projectList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const o = obj(data);
  for (const k of ["items", "projects", "data", "rows", "results"]) if (Array.isArray(o[k])) return o[k] as unknown[];
  return [];
}

/**
 * Maps one backend project to a list row. Accepts the nested shape sent on create
 * (`{ project, schedule, cost, team, … }`) or a flat record, and common id/name variants.
 */
export function toProjectSummary(raw: unknown, index: number, today: string): ProjectSummary {
  const r = obj(raw);
  const p = { ...r, ...obj(r.project) };
  const schedule = { ...r, ...obj(r.schedule) };
  const c = { ...r, ...obj(r.cost) };
  const team = { ...r, ...obj(r.team) };

  const id = idOf(r.id, r._id, p.id, p._id, r.projectId) ?? `row-${index}`;
  const owner = obj(p.owner);
  const ownerId = idOf(p.ownerId, owner.id, owner._id) ?? null;
  const ownerName = str(p.ownerName, owner.name, owner.fullName, owner.email) ?? "—";

  const days = Array.isArray(schedule.workingDays)
    ? [...new Set((schedule.workingDays as unknown[]).map((d) => num(d)).filter((d): d is Weekday => d !== undefined && WEEKDAYS.includes(d as Weekday)))].sort((a, b) => a - b)
    : [];
  const calendar = CALENDARS[str(schedule.calendarId) ?? ""];
  const workingDays = days.length ? days : calendar ? [...calendar.workingDays] : [...CALENDARS["sun-thu"].workingDays];

  const cost = makeProjectCost(num(c.budget) ?? 0, str(c.currency) ?? "USD", num(c.contingencyPct) ?? 0);

  const rawMembers = Array.isArray(team.members) ? (team.members as unknown[]) : [];
  const members = rawMembers.map((m, i) => {
    const mo = obj(m);
    const user = obj(mo.user);
    const mid = idOf(mo.userId, mo.id, user.id, user._id) ?? `m-${i}`;
    const name = str(mo.name, user.name, user.fullName, user.email);
    const initials = str(mo.initials, user.initials) ?? (name ? initialsOf(name) : "?");
    return { id: mid, name: name ?? mid, initials, index: i };
  });

  const plannedStart = isoDate(schedule.plannedStart ?? schedule.startDate);
  const plannedDue = isoDate(schedule.plannedDue ?? schedule.dueDate ?? schedule.endDate);
  const progress = Math.max(0, Math.min(100, Math.round(num(r.progress, r.completionPct, p.progress) ?? 0)));
  const given = str(r.health, r.status, p.health, p.status)?.toLowerCase().replace(/[\s_]+/g, "-") as HealthStatus | undefined;
  const health: HealthStatus = given && HEALTH.includes(given) ? given
    : progress >= 100 ? "completed"
    : plannedDue && plannedDue < today ? "delayed"
    : progress === 0 ? "not-started" : "on-track";

  return {
    id, title: str(p.title, p.name) ?? "—", category: str(p.category) ?? "", ownerId, ownerName,
    workingDays, plannedStart, plannedDue, cost, members, progress, health,
  };
}

/** Loads the projects list from the backend; `reload()` refetches. */
export function useAllProjects(today: string) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    projectsApi.getAllProjects(ctrl.signal)
      .then((data) => {
        console.log("[projects] getAllProjects response", data);
        setProjects(projectList(data).map((p, i) => toProjectSummary(p, i, today)));
      })
      .catch((err: unknown) => { if ((err as Error)?.name !== "AbortError") setError(err as Error); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [today, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { projects, loading, error, reload };
}
