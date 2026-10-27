import { Protected } from "@/lib/protected";
import { DashboardScreen, PageGuard } from "@ptp/ui";

export default function Page() {
  return <Protected><PageGuard page="dashboard"><DashboardScreen /></PageGuard></Protected>;
}
