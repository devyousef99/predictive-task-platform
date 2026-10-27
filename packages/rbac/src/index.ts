/**
 * Role-Based Access Control — single source of truth for the whole platform.
 * The same matrix drives: server-side authorization (API routes / server actions),
 * client-side UI gating, and the "Roles & permissions" screen in the shell app.
 *
 * Two layers (spec §4.1):
 *  - Organization roles: govern billing, members, org-wide settings.
 *  - Project roles: govern everything inside one project.
 */

export const ORG_ROLES = ["org_owner", "org_admin", "org_billing", "org_member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PROJECT_ROLES = ["owner", "pm", "contributor", "reviewer", "stakeholder"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PERMISSIONS = [
  // Project governance
  "project.edit",
  "project.delete",
  "project.archive",
  "project.members.invite",
  "project.members.remove",
  "project.roles.assign",
  "project.budget.manage",
  "project.calendar.configure",
  // Work management
  "task.create",
  "task.edit",
  "task.delete",
  "task.assign",
  "task.baseline.set",
  "task.progress.update", // own assigned tasks
  "task.hours.log",
  "task.comment",
  "task.review.approve",
  "task.review.reject",
  "task.visibility.restricted.view",
  // Monitoring
  "alerts.trigger",
  "analytics.full.view",
  "dashboard.summary.view",
  "audit.view",
  // Organization / billing (org-level)
  "org.billing.manage",
  "org.members.manage",
  "org.settings.manage",
  "org.revenue.dashboard.view",
  // Workspace pages (appended last so persisted matrices keep their permission indices)
  "page.dashboard.view",
  "page.projects.view",
  "page.tasks.view",
  "page.team.view",
  "page.availability.view",
  "page.roles.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface RoleDefinition<R extends string> {
  id: R;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

const ALL_PROJECT: Permission[] = PERMISSIONS.filter((p) => !p.startsWith("org."));

export const PROJECT_ROLE_DEFINITIONS: Record<ProjectRole, RoleDefinition<ProjectRole>> = {
  owner: {
    id: "owner",
    name: "Project Owner",
    description: "Overall responsible for project setup, configuration, and team governance.",
    permissions: ALL_PROJECT,
  },
  pm: {
    id: "pm",
    name: "Project Manager",
    description: "Responsible for task management, schedule tracking, and execution.",
    permissions: [
      "project.members.invite",
      "task.create", "task.edit", "task.delete", "task.assign", "task.baseline.set",
      "task.progress.update", "task.hours.log", "task.comment",
      "task.visibility.restricted.view",
      "alerts.trigger", "analytics.full.view", "dashboard.summary.view", "audit.view",
      "page.dashboard.view", "page.projects.view", "page.tasks.view", "page.team.view", "page.availability.view", "page.roles.view",
    ],
  },
  contributor: {
    id: "contributor",
    name: "Task Contributor / Assignee",
    description: "Team members executing assigned project tasks.",
    permissions: ["task.progress.update", "task.hours.log", "task.comment", "dashboard.summary.view",
      "page.dashboard.view", "page.tasks.view", "page.availability.view", "page.roles.view"],
  },
  reviewer: {
    id: "reviewer",
    name: "Project Reviewer / Quality Lead",
    description: "Reviews task outputs and verifies deliverable quality.",
    permissions: [
      "task.review.approve", "task.review.reject", "task.comment",
      "task.visibility.restricted.view", "dashboard.summary.view", "audit.view",
      "page.dashboard.view", "page.tasks.view", "page.availability.view", "page.roles.view",
    ],
  },
  stakeholder: {
    id: "stakeholder",
    name: "Stakeholder / View-Only",
    description: "Executive sponsor, client representative, or auditor needing progress visibility.",
    permissions: ["dashboard.summary.view", "page.dashboard.view"],
  },
};

export const ORG_ROLE_DEFINITIONS: Record<OrgRole, RoleDefinition<OrgRole>> = {
  org_owner: {
    id: "org_owner",
    name: "Organization Owner",
    description: "Full control of the workspace, subscription, and members.",
    permissions: ["org.billing.manage", "org.members.manage", "org.settings.manage", "org.revenue.dashboard.view"],
  },
  org_admin: {
    id: "org_admin",
    name: "Organization Admin",
    description: "Manages members and settings; cannot change the subscription.",
    permissions: ["org.members.manage", "org.settings.manage"],
  },
  org_billing: {
    id: "org_billing",
    name: "Billing Manager",
    description: "Manages plan, seats, and invoices only.",
    permissions: ["org.billing.manage"],
  },
  org_member: {
    id: "org_member",
    name: "Member",
    description: "Standard member; access is granted per project.",
    permissions: [],
  },
};

export interface Principal {
  userId: string;
  orgRole: OrgRole;
  /** projectId → role */
  projectRoles: Record<string, ProjectRole>;
  /** Role used for any project not listed in `projectRoles` (the signed-in user's login role). */
  defaultRole?: ProjectRole;
  /**
   * Permissions loaded from the backend for this user's role. `known` is every permission key the
   * backend defines; for those keys `granted` decides. Keys the backend doesn't define fall back to the matrix.
   */
  permissions?: { granted: readonly string[]; known: readonly string[] };
  /** Platform super admin: every permission in every project, regardless of the role matrix. */
  superAdmin?: boolean;
}

/** True for the backend's super-admin role, however it is spelled (SUPER_ADMIN, super-admin, superAdmin…). */
export function isSuperAdminRole(role: string | null | undefined): boolean {
  return String(role ?? "").toLowerCase().replace(/[\s_-]+/g, "") === "superadmin";
}

/* ─── Customizable matrix ────────────────────────────────────────────────── */

export const PROJECT_PERMISSIONS: readonly Permission[] = ALL_PROJECT;
export const ORG_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter((p) => p.startsWith("org."));

/**
 * Editable view of the matrix: role → granted permissions. The definitions above are the
 * defaults; an organization admin can override them from the Admin screen. `can()` accepts
 * a matrix so every host (Next zones, prototype, server guards) evaluates the same overrides.
 */
export interface RoleMatrix {
  project: Record<ProjectRole, Permission[]>;
  org: Record<OrgRole, Permission[]>;
}

export const DEFAULT_ROLE_MATRIX: RoleMatrix = {
  project: Object.fromEntries(PROJECT_ROLES.map((r) => [r, [...PROJECT_ROLE_DEFINITIONS[r].permissions]])) as RoleMatrix["project"],
  org: Object.fromEntries(ORG_ROLES.map((r) => [r, [...ORG_ROLE_DEFINITIONS[r].permissions]])) as RoleMatrix["org"],
};

export function cloneRoleMatrix(m: RoleMatrix): RoleMatrix {
  return {
    project: Object.fromEntries(PROJECT_ROLES.map((r) => [r, [...(m.project[r] ?? [])]])) as RoleMatrix["project"],
    org: Object.fromEntries(ORG_ROLES.map((r) => [r, [...(m.org[r] ?? [])]])) as RoleMatrix["org"],
  };
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Order-insensitive equality (the editor appends grants, so arrays may differ in order). */
export function roleMatrixEquals(a: RoleMatrix, b: RoleMatrix): boolean {
  return PROJECT_ROLES.every((r) => sameSet(a.project[r] ?? [], b.project[r] ?? []))
    && ORG_ROLES.every((r) => sameSet(a.org[r] ?? [], b.org[r] ?? []));
}

/** Number of (role, permission) cells that differ between two matrices. */
export function roleMatrixDiff(a: RoleMatrix, b: RoleMatrix): number {
  let n = 0;
  for (const r of PROJECT_ROLES) for (const p of PROJECT_PERMISSIONS) if ((a.project[r] ?? []).includes(p) !== (b.project[r] ?? []).includes(p)) n++;
  for (const r of ORG_ROLES) for (const p of ORG_PERMISSIONS) if ((a.org[r] ?? []).includes(p) !== (b.org[r] ?? []).includes(p)) n++;
  return n;
}

/** Return a new matrix with one cell flipped. Project roles only accept project permissions and vice-versa. */
export function toggleRoleMatrix(m: RoleMatrix, scope: keyof RoleMatrix, role: ProjectRole | OrgRole, permission: Permission): RoleMatrix {
  const next = cloneRoleMatrix(m);
  const list = (next[scope] as Record<string, Permission[]>)[role] ?? [];
  (next[scope] as Record<string, Permission[]>)[role] = list.includes(permission) ? list.filter((p) => p !== permission) : [...list, permission];
  return next;
}

/**
 * Compact wire format — permission indices instead of names — so a fully-granted matrix
 * stays small in browser storage. Unknown roles/indices are dropped on decode; roles
 * missing from the payload fall back to their defaults.
 */
export function encodeRoleMatrix(m: RoleMatrix): string {
  const idx = (list: readonly Permission[]) => list.map((p) => PERMISSIONS.indexOf(p)).filter((i) => i >= 0).sort((a, b) => a - b);
  return JSON.stringify({
    v: 1,
    n: PERMISSIONS.length, // how many permissions existed when saved — newer ones fall back to defaults on decode
    project: Object.fromEntries(PROJECT_ROLES.map((r) => [r, idx(m.project[r] ?? [])])),
    org: Object.fromEntries(ORG_ROLES.map((r) => [r, idx(m.org[r] ?? [])])),
  });
}

/** Payloads saved before `n` existed predate the "page.*" permissions, so treat everything from there on as unknown to them. */
const LEGACY_KNOWN = PERMISSIONS.indexOf("page.dashboard.view");

export function decodeRoleMatrix(raw: string | null | undefined): RoleMatrix | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { v?: number; n?: number; project?: Record<string, unknown>; org?: Record<string, unknown> };
    if (!data || typeof data !== "object" || data.v !== 1) return null;
    const known = typeof data.n === "number" && data.n > 0 ? data.n : LEGACY_KNOWN;
    // Stored grants, plus the defaults for any permission added after the matrix was saved (migration).
    const fromIdx = (v: unknown, allowed: readonly Permission[], defaults: readonly Permission[]): Permission[] | null => {
      if (!Array.isArray(v)) return null;
      const out: Permission[] = [];
      for (const i of v) { const p = PERMISSIONS[i as number]; if (p && allowed.includes(p) && !out.includes(p)) out.push(p); }
      for (const p of defaults) if (PERMISSIONS.indexOf(p) >= known && !out.includes(p)) out.push(p);
      return out;
    };
    const m = cloneRoleMatrix(DEFAULT_ROLE_MATRIX);
    for (const r of PROJECT_ROLES) { const v = fromIdx(data.project?.[r], PROJECT_PERMISSIONS, DEFAULT_ROLE_MATRIX.project[r]); if (v) m.project[r] = v; }
    for (const r of ORG_ROLES) { const v = fromIdx(data.org?.[r], ORG_PERMISSIONS, DEFAULT_ROLE_MATRIX.org[r]); if (v) m.org[r] = v; }
    return m;
  } catch {
    return null;
  }
}

/** Check a permission for a principal, optionally within a project. Pass a custom matrix to honour admin overrides. */
export function can(principal: Principal, permission: Permission, projectId?: string, matrix: RoleMatrix = DEFAULT_ROLE_MATRIX): boolean {
  if (principal.superAdmin) return true;
  // Backend grants win for every permission the backend knows (role-level, so they apply in every project).
  if (principal.permissions?.known.includes(permission)) return principal.permissions.granted.includes(permission);
  if (permission.startsWith("org.")) {
    return (matrix.org[principal.orgRole] ?? []).includes(permission);
  }
  if (!projectId) return false;
  const role = principal.projectRoles[projectId] ?? principal.defaultRole;
  if (!role) return false;
  return (matrix.project[role] ?? []).includes(permission);
}

/** Throw-style guard for server actions / route handlers. */
export function assertCan(principal: Principal, permission: Permission, projectId?: string, matrix: RoleMatrix = DEFAULT_ROLE_MATRIX): void {
  if (!can(principal, permission, projectId, matrix)) {
    const err = new Error(`Forbidden: missing ${permission}`);
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}

/** Grouped view of the matrix for the UI. */
export const PERMISSION_GROUPS: { id: string; label: string; permissions: Permission[] }[] = [
  {
    id: "governance", label: "Project governance",
    permissions: ["project.edit", "project.delete", "project.archive", "project.members.invite",
      "project.members.remove", "project.roles.assign", "project.budget.manage", "project.calendar.configure"],
  },
  {
    id: "work", label: "Work management",
    permissions: ["task.create", "task.edit", "task.delete", "task.assign", "task.baseline.set",
      "task.progress.update", "task.hours.log", "task.comment", "task.review.approve",
      "task.review.reject", "task.visibility.restricted.view"],
  },
  {
    id: "monitoring", label: "Monitoring & analytics",
    permissions: ["alerts.trigger", "analytics.full.view", "dashboard.summary.view", "audit.view"],
  },
  {
    id: "pages", label: "Workspace pages",
    permissions: ["page.dashboard.view", "page.projects.view", "page.tasks.view", "page.team.view", "page.availability.view", "page.roles.view"],
  },
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "project.edit": "Edit project details",
  "project.delete": "Delete project",
  "project.archive": "Archive project",
  "project.members.invite": "Invite members",
  "project.members.remove": "Remove members",
  "project.roles.assign": "Assign project roles",
  "project.budget.manage": "Manage budget",
  "project.calendar.configure": "Configure work calendar",
  "task.create": "Create tasks & subtasks",
  "task.edit": "Edit tasks",
  "task.delete": "Delete tasks",
  "task.assign": "Assign users",
  "task.baseline.set": "Set baseline timelines",
  "task.progress.update": "Update completion % / status",
  "task.hours.log": "Log hours",
  "task.comment": "Add comments",
  "task.review.approve": "Approve completion",
  "task.review.reject": "Reject completion",
  "task.visibility.restricted.view": "View restricted tasks",
  "alerts.trigger": "Trigger delay alerts",
  "analytics.full.view": "View full performance analytics",
  "dashboard.summary.view": "View dashboards & health scores",
  "audit.view": "View audit log",
  "org.billing.manage": "Manage subscription & billing",
  "org.members.manage": "Manage organization members",
  "org.settings.manage": "Manage organization settings",
  "org.revenue.dashboard.view": "View revenue dashboard (internal)",
  "page.dashboard.view": "Open the Dashboard page",
  "page.projects.view": "Open the Projects page",
  "page.tasks.view": "Open the Tasks page",
  "page.team.view": "Open the Team page",
  "page.availability.view": "Open the Availability page",
  "page.roles.view": "Open the Roles page",
};
