import { readRoute } from "@/lib/api-params";
import { recurringOverview } from "@/lib/insights";

export const dynamic = "force-dynamic";

// Writes are the dashboard's validated handlers; proxy.ts requires write scope.
export { POST, PUT, PATCH, DELETE } from "@/app/api/recurring/route";

// confirmed = user-reviewed rules still charging (the truth; monthlyEstimate
// sums these). possiblyEnded and ended are out of totals, and so are
// suggestions (unreviewed detector candidates).
export const GET = readRoute(async () => recurringOverview());
