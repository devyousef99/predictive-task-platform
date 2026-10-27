import { Protected } from "@/lib/protected";
import { AdminRolesScreen, PageGuard } from "@ptp/ui";

/** Organization admins only — RBAC check (honouring admin overrides) before the editor renders. */
export default function Page() {
  return <Protected><PageGuard page="admin"><AdminRolesScreen /></PageGuard></Protected>;
}
