import { CALENDAR_TEMPLATES, type Weekday, type WorkCalendar } from "@ptp/forecast";
import type { OrgRole, ProjectRole } from "@ptp/rbac";

/**
 * Shared model types and app configuration (calendar templates, plan catalog).
 * There is no seed or demo data here: users, projects, tasks, availability and roles come from the API.
 */

/** Today's date as "YYYY-MM-DD" in the browser's time zone. */
export function todayISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface User {
  id: string; name: string; email: string; initials: string; capacity: number; title?: string;
  orgRole?: OrgRole; invited?: boolean;
  /** Role chosen for the user — applied to every project. */
  defaultRole?: ProjectRole;
}

/** Organization role implied by a project role (until the backend sends one). */
export const orgRoleFor = (role: ProjectRole): OrgRole => (role === "owner" ? "org_owner" : role === "pm" ? "org_admin" : "org_member");

export const CALENDARS: Record<string, WorkCalendar> = {
  "sun-thu": { ...CALENDAR_TEMPLATES["sun-thu"], holidays: ["2026-09-23"] },
  "mon-fri": CALENDAR_TEMPLATES["mon-fri"],
};

export type Priority = "low" | "medium" | "high" | "critical";
export type Level = "low" | "medium" | "high";
export type ReportingCadence = "daily" | "weekly" | "biweekly" | "monthly";
export type RiskResponse = "avoid" | "mitigate" | "transfer" | "accept";
export interface Milestone { title: string; date: string }
export interface Stakeholder { name: string; role: string; interest: Level; influence: Level }
export interface Risk { title: string; probability: Level; impact: Level; response: RiskResponse }

/** Project cost baseline (PMBOK cost): budget plus a contingency reserve. Same shape the create-project API receives. */
export interface ProjectCost {
  budget: number;
  currency: string;
  /** Contingency reserve as a percentage of the budget (0–100). */
  contingencyPct: number;
  /** budget × contingencyPct / 100, rounded. */
  contingencyAmount: number;
  /** budget + contingencyAmount. */
  totalWithReserve: number;
}

/** Builds a consistent ProjectCost; the derived amounts are always computed, never entered. */
export function makeProjectCost(budget: number, currency = "USD", contingencyPct = 0): ProjectCost {
  const contingencyAmount = Math.round(budget * (contingencyPct / 100));
  return { budget, currency, contingencyPct, contingencyAmount, totalWithReserve: budget + contingencyAmount };
}

/* Product backlog captured with the project: generic work-item types so it fits any kind of project. */
export type BacklogType = "deliverable" | "requirement" | "task" | "issue" | "research" | "procurement" | "approval";
export const BACKLOG_TYPES: BacklogType[] = ["deliverable", "requirement", "task", "issue", "research", "procurement", "approval"];
export type MoSCoW = "must" | "should" | "could" | "wont";
export interface Scenario { title: string; given: string; when: string; then: string }
export interface BacklogItem {
  id: string; type: BacklogType; title: string; description?: string; priority: Priority; moscow: MoSCoW;
  /** Relative effort (planning points). */
  storyPoints?: number; plannedHours?: number; assigneeId?: string;
  /** The deliverable this item belongs to. */
  parentId?: string; scenarios: Scenario[];
}

/** Plan catalog shown on the billing page (product pricing, not customer data). */
export type PlanTier = "free" | "pro" | "business" | "enterprise";
export interface Plan { id: PlanTier; monthly: number | null; annual: number | null; storage: string; features: string[]; audience: string }
export const PLANS: Plan[] = [
  { id: "free", monthly: 0, annual: 0, storage: "5 GB", audience: "Up to 5 users",
    features: ["Basic task management", "Single calendar template", "Standard dashboards", "Email delay alerts"] },
  { id: "pro", monthly: 15, annual: 12, storage: "100 GB", audience: "Growing teams",
    features: ["Unlimited projects & subtasks", "Custom working schedules", "Advanced RBAC roles", "Slack / Teams alerts", "Resource capacity planning"] },
  { id: "business", monthly: 30, annual: 25, storage: "1 TB", audience: "PMOs & enterprises",
    features: ["Everything in Pro", "Multi-calendar per project", "Predictive ML models", "Portfolio dashboards", "SSO (SAML / Okta)", "Priority support"] },
  { id: "enterprise", monthly: null, annual: null, storage: "Unlimited", audience: "50+ seats, annual",
    features: ["Everything in Business", "Dedicated cloud / on-prem", "99.99% SLA", "Custom RBAC policies", "Dedicated CSM", "Audit logs"] },
];

export const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
export const CUSTOM_CALENDAR_ID = "custom";
export const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && [...a].sort().every((d, i) => d === [...b].sort()[i]);

/** The template whose days match, else "custom". Lets hand-picked days that equal a template keep its id. */
export const calendarIdFor = (days: readonly Weekday[]): string => Object.values(CALENDARS).find((c) => sameDays(c.workingDays, days))?.id ?? CUSTOM_CALENDAR_ID;

/* ─── Small user helpers ─────────────────────────────────────────────────── */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
export const isValidEmail = (email: string) => EMAIL.test(email.trim());
/** Display name from an email when the backend hasn't sent one: "nora.haddad@x.com" → "Nora Haddad". */
export const nameFromEmail = (email: string) =>
  email.split("@")[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || email;
