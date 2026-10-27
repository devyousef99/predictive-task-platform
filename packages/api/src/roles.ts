import { apiRequest } from "./client";
// Registers the auth store's token provider with the client, so every call here sends the bearer token.
import "./auth-store";

/** One role from GET admin/role/getAllRoles (same role documents the permissions matrix uses). */
export interface ApiRole {
  _id: string;
  key: string;
  role: string;
  roleAr?: string | null;
  description?: string | null;
}

type Obj = Record<string, unknown>;
const str = (...vs: unknown[]) => { for (const v of vs) if (typeof v === "string" && v.trim()) return v.trim(); return undefined; };

/** Normalizes one role record (accepts `name`/`title` for the label and `id` for the id). */
function toRole(raw: unknown): ApiRole | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Obj;
  const id = str(r._id, r.id);
  const label = str(r.role, r.name, r.title);
  if (!id || !label) return null;
  return { _id: id, key: str(r.key, r.slug) ?? label, role: label, roleAr: str(r.roleAr, r.nameAr) ?? null, description: str(r.description) ?? null };
}

export const rolesApi = {
  /** Every role, in stored order. `data` may be the array itself or `{ roles | items: [...] }`. */
  getAllRoles: async (signal?: AbortSignal): Promise<ApiRole[]> => {
    const data = await apiRequest<unknown>("/admin/role/getAllRoles", { signal });
    const o = (data && typeof data === "object" ? data : {}) as Obj;
    const list = Array.isArray(data) ? data : Array.isArray(o.roles) ? o.roles : Array.isArray(o.items) ? o.items : [];
    return (list as unknown[]).map(toRole).filter((r): r is ApiRole => !!r);
  },
};
