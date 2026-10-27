import { Protected } from "@/lib/protected";
import { PageGuard, TaskBoardScreen } from "@ptp/ui";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <Protected><PageGuard page="projects"><TaskBoardScreen projectId={projectId} /></PageGuard></Protected>;
}
