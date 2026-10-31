import { readRoute } from "@/lib/api-params";
import { getAnalysisSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// The user's analysis thresholds (defaults until they save their own). Read
// only: thresholds are the user's call, edited on /settings.
export const GET = readRoute(async () => getAnalysisSettings());
