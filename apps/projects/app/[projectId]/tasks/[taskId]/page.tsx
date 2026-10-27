import { Protected } from "@/lib/protected";
import { PageGuard, TaskDetailScreen } from "@ptp/ui";

export default async function Page({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  return <Protected><PageGuard page="tasks"><TaskDetailScreen taskId={taskId} projectId={projectId} /></PageGuard></Protected>;
}
