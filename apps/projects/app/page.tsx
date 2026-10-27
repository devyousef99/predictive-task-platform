import { Protected } from "@/lib/protected";
import { PageGuard, ProjectsScreen } from "@ptp/ui";

export default function Page() {
  return <Protected><PageGuard page="projects"><ProjectsScreen /></PageGuard></Protected>;
}
