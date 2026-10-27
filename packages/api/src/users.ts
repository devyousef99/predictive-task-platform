import { apiRequest } from "./client";
// Registers the auth store's token provider with the client, so every call here sends the bearer token.
import "./auth-store";

export interface CreateUserBody {
  fullName: string;
  email: string;
  jobTitle?: string;
  /** Role `_id` from GET /admin/role/getAllRoles. */
  role: string;
}

/** `data` of a successful create; fields optional until the response contract is final. */
export interface CreatedUser {
  _id?: string;
  id?: string;
  [key: string]: unknown;
}

/** One project the user belongs to, with their role there. */
export interface UserProjectRole {
  projectId: string;
  projectTitle: string;
  role: string;
  roleKey?: string;
  isOwner?: boolean;
}

/** One row of GET /admin/users/getAllUsers. */
export interface ApiUser {
  _id: string;
  fullName: string;
  email: string;
  jobTitle: string | null;
  status?: string;
  role: { _id: string; role: string; roleAr?: string | null; key?: string } | null;
  projectRoles: UserProjectRole[];
}

export interface UsersPage {
  users: ApiUser[];
  /** Total users across all pages, when the backend reports it. */
  total: number | null;
  pageNo: number;
  pageSize: number;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const num = (...vs: unknown[]) => { for (const v of vs) if (typeof v === "number" && Number.isFinite(v)) return v; return undefined; };

export const usersApi = {
  createUser: (body: CreateUserBody) =>
    apiRequest<CreatedUser | null>("/admin/users/createUser", { method: "POST", body }),

  /** One page of users. `data` may be the array itself or `{ users | items | data, total… }`. */
  getAllUsers: async (pageNo = 1, pageSize = 10, signal?: AbortSignal): Promise<UsersPage> => {
    const data = await apiRequest<unknown>(`/admin/users/getAllUsers?pageNo=${pageNo}&pageSize=${pageSize}`, { signal });
    const o = obj(data);
    const list = Array.isArray(data) ? data : ([o.users, o.items, o.data, o.rows].find(Array.isArray) as unknown[] | undefined) ?? [];
    const meta = obj(o.pagination ?? o.meta);
    return {
      users: list as ApiUser[],
      total: num(o.total, o.totalCount, o.count, o.totalUsers, meta.total, meta.totalCount) ?? null,
      pageNo,
      pageSize,
    };
  },
};
