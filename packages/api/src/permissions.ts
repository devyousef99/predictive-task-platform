import { apiRequest } from "./client";
// Registers the auth store's token provider with the client, so every call here sends the bearer token.
import "./auth-store";

export interface MatrixRole {
  _id: string;
  key: string;
  role: string;
  roleAr?: string | null;
  description?: string | null;
  permissionCount: number;
  isCurrentUser?: boolean;
}

export interface MatrixPermission {
  _id: string;
  key: string;
  name: string;
  nameAr?: string | null;
  /** Roles that have this permission (one rolePermissionLink per id). */
  roleIds: string[];
}

export interface MatrixGroup {
  key: string;
  label: string;
  permissions: MatrixPermission[];
}

/** GET /admin/permissions/matrix. `currentRoleId` is null for the super admin. */
export interface PermissionMatrix {
  currentRoleId: string | null;
  totalPermissions: number;
  roles: MatrixRole[];
  groups: MatrixGroup[];
}

/** A role's permission keys after a change. */
export interface RolePermissions {
  roleId: string;
  permissionKeys: string[];
}

/** GET /admin/role-permission/getUserRolePermission/:userId. Role fields are null for the super admin. */
export interface UserPermissions {
  userId: string;
  roleId: string | null;
  roleKey: string | null;
  role: string | null;
  roleAr: string | null;
  isSuperAdmin: boolean;
  /** Keys the user's role has (every key for the super admin; [] for a disabled user or inactive role). */
  granted: string[];
  /** Every active permission key the backend defines. */
  known: string[];
}

const id = (v: string) => encodeURIComponent(v);

/** Role × permission matrix. Changes are super-admin only (others get 403). */
export const permissionsApi = {
  getMatrix: (signal?: AbortSignal) =>
    apiRequest<PermissionMatrix>("/admin/permissions/matrix", { signal }),

  /** One user's permissions. Anyone may read their own; only the super admin may read others (403). */
  getUserPermissions: (userId: string, signal?: AbortSignal) =>
    apiRequest<UserPermissions>(`/admin/role-permission/getUserRolePermission/${id(userId)}`, { signal }),

  /** Grants or revokes one permission for one role. */
  setPermission: (roleId: string, permissionKey: string, granted: boolean) =>
    apiRequest<RolePermissions>(`/admin/permissions/roles/${id(roleId)}`, { method: "PATCH", body: { permissionKey, granted } }),

  /** Replaces a role's whole permission list. */
  setRolePermissions: (roleId: string, permissionKeys: string[]) =>
    apiRequest<RolePermissions>(`/admin/permissions/roles/${id(roleId)}`, { method: "PUT", body: { permissionKeys } }),

  listPermissions: (signal?: AbortSignal) => apiRequest<unknown>("/admin/permissions", { signal }),

  getRolePermissions: (roleId: string, signal?: AbortSignal) =>
    apiRequest<RolePermissions>(`/admin/permissions/roles/${id(roleId)}`, { signal }),
};
