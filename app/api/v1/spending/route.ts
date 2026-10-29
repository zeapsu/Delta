import { monthParam, readRoute } from "@/lib/api-params";
import { categoryTotals } from "@/lib/insights";

export const dynamic = "force-dynamic";

// Spend per category for a month, biggest first. total includes pending
// charges; pendingTotal is the still-pending part; refunds net within a category.
export const GET = readRoute(async (sp) => {
  const month = monthParam(sp);
  const categories = await categoryTotals(month);
  return {
    month,
    total: categories.reduce((s, c) => s + c.total, 0),
    pendingTotal: categories.reduce((s, c) => s + c.pendingTotal, 0),
    categories,
  };
});
