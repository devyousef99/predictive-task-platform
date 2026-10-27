import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_MATRIX, PERMISSIONS, PROJECT_ROLES, PROJECT_ROLE_DEFINITIONS, assertCan, can, decodeRoleMatrix, encodeRoleMatrix, isSuperAdminRole, roleMatrixDiff, roleMatrixEquals, toggleRoleMatrix, type Principal } from "./index";

const p: Principal = {
  userId: "u1",
  orgRole: "org_member",
  projectRoles: { p1: "contributor", p2: "owner" },
};

describe("super admin", () => {
  const sa: Principal = { userId: "u9", orgRole: "org_member", projectRoles: {}, superAdmin: true };
  const empty = { project: Object.fromEntries(PROJECT_ROLES.map((r) => [r, []])), org: { org_owner: [], org_admin: [], org_billing: [], org_member: [] } } as never;
  it("passes every check in every project, even against an empty matrix", () => {
    for (const perm of PERMISSIONS) {
      expect(can(sa, perm, "p3")).toBe(true);
      expect(can(sa, perm, undefined, empty)).toBe(true);
    }
  });
  it("recognises the backend role however it is spelled", () => {
    for (const r of ["SUPER_ADMIN", "super_admin", "superAdmin", "Super Admin", "super-admin"]) expect(isSuperAdminRole(r)).toBe(true);
    for (const r of ["admin", "owner", "", null, undefined]) expect(isSuperAdminRole(r)).toBe(false);
  });
});

describe("backend permissions", () => {
  const known = ["project.edit", "page.team.view", "task.create"];
  const base: Principal = { userId: "u8", orgRole: "org_member", projectRoles: {}, defaultRole: "contributor", permissions: { granted: ["project.edit"], known } };
  it("grant a permission the role matrix would deny", () => {
    expect(can(base, "project.edit", "any")).toBe(true);
  });
  it("deny a permission the role matrix would grant", () => {
    expect(can({ ...base, defaultRole: "owner" }, "task.create", "any")).toBe(false);
  });
  it("fall back to the matrix for keys the backend doesn't define", () => {
    expect(can(base, "task.comment", "any")).toBe(true); // contributor has it in the matrix
    expect(can(base, "org.billing.manage")).toBe(false);
  });
});

describe("default role", () => {
  const d: Principal = { userId: "u7", orgRole: "org_member", projectRoles: { p2: "stakeholder" }, defaultRole: "pm" };
  it("applies to projects without an explicit role", () => {
    expect(can(d, "task.create", "any-project")).toBe(true);
  });
  it("an explicit project role still wins", () => {
    expect(can(d, "task.create", "p2")).toBe(false);
  });
});

describe("project permissions (spec §4.1 matrix)", () => {
  it("contributor can update progress but not create tasks", () => {
    expect(can(p, "task.progress.update", "p1")).toBe(true);
    expect(can(p, "task.create", "p1")).toBe(false);
  });
  it("owner has every project permission", () => {
    expect(can(p, "project.delete", "p2")).toBe(true);
    expect(can(p, "project.calendar.configure", "p2")).toBe(true);
  });
  it("no role in a project means no access", () => {
    expect(can(p, "dashboard.summary.view", "p3")).toBe(false);
  });
  it("stakeholder is strictly read-only", () => {
    const perms = PROJECT_ROLE_DEFINITIONS.stakeholder.permissions;
    expect(perms).toEqual(["dashboard.summary.view", "page.dashboard.view"]);
  });
  it("page access is role-based: contributors see Tasks but not Projects or Team", () => {
    expect(can(p, "page.tasks.view", "p1")).toBe(true);
    expect(can(p, "page.projects.view", "p1")).toBe(false);
    expect(can(p, "page.team.view", "p1")).toBe(false);
    expect(can(p, "page.team.view", "p2")).toBe(true); // owner in p2
  });
  it("only reviewers and owners can approve", () => {
    const approvers = PROJECT_ROLES.filter((r) => PROJECT_ROLE_DEFINITIONS[r].permissions.includes("task.review.approve"));
    expect(approvers.sort()).toEqual(["owner", "reviewer"]);
  });
});

describe("org permissions", () => {
  it("members cannot manage billing; owners can", () => {
    expect(can(p, "org.billing.manage")).toBe(false);
    expect(can({ ...p, orgRole: "org_owner" }, "org.billing.manage")).toBe(true);
  });
  it("assertCan throws a 403", () => {
    expect(() => assertCan(p, "org.billing.manage")).toThrow(/Forbidden/);
  });
});

describe("customizable matrix", () => {
  it("defaults mirror the role definitions", () => {
    expect(DEFAULT_ROLE_MATRIX.project.stakeholder).toEqual(["dashboard.summary.view", "page.dashboard.view"]);
    expect(DEFAULT_ROLE_MATRIX.org.org_member).toEqual([]);
  });
  it("can() honours an overridden matrix without touching the defaults", () => {
    const custom = toggleRoleMatrix(DEFAULT_ROLE_MATRIX, "project", "contributor", "task.create");
    expect(can(p, "task.create", "p1", custom)).toBe(true);
    expect(can(p, "task.create", "p1")).toBe(false);
    expect(roleMatrixDiff(custom, DEFAULT_ROLE_MATRIX)).toBe(1);
    expect(roleMatrixEquals(toggleRoleMatrix(custom, "project", "contributor", "task.create"), DEFAULT_ROLE_MATRIX)).toBe(true);
  });
  it("round-trips through the compact wire format", () => {
    const custom = toggleRoleMatrix(toggleRoleMatrix(DEFAULT_ROLE_MATRIX, "org", "org_admin", "org.billing.manage"), "project", "pm", "project.delete");
    const decoded = decodeRoleMatrix(encodeRoleMatrix(custom));
    expect(decoded).not.toBeNull();
    expect(roleMatrixEquals(decoded!, custom)).toBe(true);
    expect(encodeRoleMatrix(custom).length).toBeLessThan(600);
  });
  it("matrices saved before new permissions existed inherit the defaults for them", () => {
    // A legacy payload (no `n`) that only knows the first permission for the stakeholder role.
    const legacy = JSON.stringify({ v: 1, project: { stakeholder: [PERMISSIONS.indexOf("dashboard.summary.view")] } });
    const m = decodeRoleMatrix(legacy)!;
    expect(m.project.stakeholder).toContain("page.dashboard.view");
    expect(m.project.stakeholder).not.toContain("page.projects.view");
    // A current payload that explicitly revokes a page permission keeps that revocation.
    const current = toggleRoleMatrix(DEFAULT_ROLE_MATRIX, "project", "stakeholder", "page.dashboard.view");
    expect(decodeRoleMatrix(encodeRoleMatrix(current))!.project.stakeholder).not.toContain("page.dashboard.view");
  });
  it("rejects garbage and drops permissions of the wrong scope", () => {
    expect(decodeRoleMatrix("not json")).toBeNull();
    expect(decodeRoleMatrix(JSON.stringify({ v: 2 }))).toBeNull();
    const orgIdx = PERMISSIONS.indexOf("org.billing.manage"); // org-scoped — must not land in a project role
    const m = decodeRoleMatrix(JSON.stringify({ v: 1, n: PERMISSIONS.length, project: { stakeholder: [orgIdx, 999] } }))!;
    expect(m.project.stakeholder).toEqual([]);
    expect(m.project.owner.length).toBeGreaterThan(0); // missing role → default
  });
});
