import { Protected } from "@/lib/protected";
import { PageGuard, RoleMatrixScreen } from "@ptp/ui";

export default function Page() {
  return <Protected><PageGuard page="roles"><RoleMatrixScreen /></PageGuard></Protected>;
}
