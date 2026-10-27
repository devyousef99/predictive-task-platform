import { Protected } from "@/lib/protected";
import { AvailabilityScreen, PageGuard } from "@ptp/ui";

export default function Page() {
  return <Protected><PageGuard page="availability"><AvailabilityScreen /></PageGuard></Protected>;
}
