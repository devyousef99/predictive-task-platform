import { Protected } from "@/lib/protected";
import { BillingScreen, PageGuard } from "@ptp/ui";

export default function Page() {
  return <Protected><PageGuard page="billing"><BillingScreen /></PageGuard></Protected>;
}
