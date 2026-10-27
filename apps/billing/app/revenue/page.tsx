import { Protected } from "@/lib/protected";
import { PageGuard, RevenueScreen } from "@ptp/ui";

/** Internal operator dashboard — RBAC check (honouring admin overrides) before anything renders. */
export default function Page() {
  return <Protected><PageGuard page="revenue"><RevenueScreen /></PageGuard></Protected>;
}
