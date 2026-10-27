import { Protected } from "@/lib/protected";
import { PageGuard, TeamScreen } from "@ptp/ui";

export default function Page() {
  return <Protected><PageGuard page="team"><TeamScreen /></PageGuard></Protected>;
}
