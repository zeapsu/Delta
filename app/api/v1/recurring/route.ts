import { readRoute } from "@/lib/api-params";
import { recurringOverview } from "@/lib/insights";

export const dynamic = "force-dynamic";

// Writes are the dashboard's validated handlers; proxy.ts requires write scope.
export { POST, PUT, DELETE } from "@/app/api/recurring/route";

// confirmed = user-reviewed rules (the truth; monthlyEstimate sums these).
// suggestions = unreviewed detector candidates, never count them in totals.
export const GET = readRoute(async () => recurringOverview());
