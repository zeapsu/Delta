import { intParam, monthParam, readRoute } from "@/lib/api-params";
import { monthlyCashFlow } from "@/lib/insights";
import { recentMonths } from "@/lib/months";

export const dynamic = "force-dynamic";

// Posted income vs spend per month, oldest first. The current month is partial.
export const GET = readRoute(async (sp) => {
  const n = intParam(sp, "months", { min: 1, max: 36, fallback: 6 })!;
  return { months: await monthlyCashFlow(recentMonths(n, monthParam(sp, "end"))) };
});
