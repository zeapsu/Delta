import { monthParam, readRoute } from "@/lib/api-params";
import { budgetProgress } from "@/lib/insights";

export const dynamic = "force-dynamic";

// Writes are the dashboard's validated handlers; proxy.ts requires write scope.
export { POST, DELETE } from "@/app/api/budgets/route";

// Budgets with this month's progress (pending included, refunds net; spent is
// clamped at 0, pct > 100 = over budget).
export const GET = readRoute(async (sp) => {
  const month = monthParam(sp);
  return { month, budgets: await budgetProgress(month) };
});
