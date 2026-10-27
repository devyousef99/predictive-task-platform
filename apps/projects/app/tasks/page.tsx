import { Protected } from "@/lib/protected";
import { PageGuard, TaskBoardScreen } from "@ptp/ui";

export default function Page() {
  return <Protected><PageGuard page="tasks"><TaskBoardScreen /></PageGuard></Protected>;
}
