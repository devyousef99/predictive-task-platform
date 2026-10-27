import { Protected } from "@/lib/protected";
import { NewProjectScreen, PageGuard } from "@ptp/ui";

export default function Page() {
  return <Protected><PageGuard page="projects"><NewProjectScreen /></PageGuard></Protected>;
}
