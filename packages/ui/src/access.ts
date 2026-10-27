import { DEFAULT_ROLE_MATRIX, can, type Permission, type Principal, type RoleMatrix } from "@ptp/rbac";

/**
 * Page access — server-safe (no "use client") so Next pages, the login redirect and the client
 * guard all agree. Project-scoped page permissions are checked with a placeholder project id that
 * no real project uses, so they resolve to the signed-in user's login role (`principal.defaultRole`).
 */
export const ACTING_PROJECT = "__any_project__";

export type PageId = "dashboard" | "projects" | "tasks" | "team" | "availability" | "roles" | "admin" | "users" | "billing" | "revenue";

export const PAGES: Record<PageId, { path: string; perm: Permission; scope: "project" | "org" }> = {
  dashboard: { path: "/", perm: "page.dashboard.view", scope: "project" },
  projects: { path: "/projects", perm: "page.projects.view", scope: "project" },
  tasks: { path: "/projects/tasks", perm: "page.tasks.view", scope: "project" },
  team: { path: "/team", perm: "page.team.view", scope: "project" },
  availability: { path: "/availability", perm: "page.availability.view", scope: "project" },
  roles: { path: "/settings/roles", perm: "page.roles.view", scope: "project" },
  admin: { path: "/settings/admin", perm: "org.settings.manage", scope: "org" },
  users: { path: "/settings/users", perm: "org.members.manage", scope: "org" },
  billing: { path: "/billing", perm: "org.billing.manage", scope: "org" },
  revenue: { path: "/billing/revenue", perm: "org.revenue.dashboard.view", scope: "org" },
};

export type PermCheck = (permission: Permission, projectId?: string) => boolean;

export const pageAllowed = (check: PermCheck, page: PageId) => {
  const pg = PAGES[page];
  return check(pg.perm, pg.scope === "project" ? ACTING_PROJECT : undefined);
};

export const checkerFor = (principal: Principal, matrix: RoleMatrix = DEFAULT_ROLE_MATRIX): PermCheck =>
  (permission, projectId) => can(principal, permission, projectId, matrix);

/** Landing order after sign-in: managers land on the Dashboard, doers on their Tasks, everyone else on the first page they may open. */
const LANDING_ORDER: PageId[] = ["tasks", "dashboard", "projects", "team", "availability", "roles", "billing", "users", "admin"];

export function landingPath(principal: Principal, matrix: RoleMatrix = DEFAULT_ROLE_MATRIX): string {
  const check = checkerFor(principal, matrix);
  if (check("analytics.full.view", ACTING_PROJECT) && pageAllowed(check, "dashboard")) return PAGES.dashboard.path;
  for (const id of LANDING_ORDER) if (pageAllowed(check, id)) return PAGES[id].path;
  return PAGES.dashboard.path;
}
