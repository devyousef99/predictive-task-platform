import type { ProjectRole } from "@ptp/rbac";
import type { Session } from "./context";
import { initialsOf, nameFromEmail, orgRoleFor } from "./models";

// Server-safe module (no "use client"): importable from route handlers and server components.
/**
 * The signed-in user's session, built from the verified login (auth store): backend id, email and role.
 * The login role applies to every project (`defaultRole`); a super admin passes every permission check.
 */
export function makeSession(
  user: { id: string; email: string; name?: string }, role: ProjectRole, superAdmin = false,
  /** Permissions loaded from the backend (see usePermissionsStore); null → the built-in role matrix decides. */
  permissions: { granted: readonly string[]; known: readonly string[] } | null = null,
): Session {
  const name = user.name?.trim() || nameFromEmail(user.email);
  return {
    principal: {
      userId: user.id, orgRole: superAdmin ? "org_owner" : orgRoleFor(role), projectRoles: {}, defaultRole: superAdmin ? "owner" : role, superAdmin,
      ...(permissions && { permissions }),
    },
    user: { id: user.id, name, email: user.email, initials: initialsOf(name) },
    orgName: "Foresight",
  };
}
