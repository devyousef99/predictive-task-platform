import { Protected } from "@/lib/protected";
import { PageGuard, UsersAdminScreen } from "@ptp/ui";

/** Organization admins only — RBAC check before the user manager renders. */
export default function Page() {
  return <Protected><PageGuard page="users"><UsersAdminScreen /></PageGuard></Protected>;
}
