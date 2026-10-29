import { monthParam, ParamError, readRoute } from "@/lib/api-params";
import { categoryTotals } from "@/lib/insights";

export const dynamic = "force-dynamic";

// Spend per category for a month, biggest first. total includes pending
// charges; pendingTotal is the still-pending part; refunds net within a
// category. date_basis=authorized buckets by purchase date (posted date when
// unknown) instead of the posted date.
export const GET = readRoute(async (sp) => {
  const month = monthParam(sp);
  const dateBasis = sp.get("date_basis") ?? "posted";
  if (dateBasis !== "posted" && dateBasis !== "authorized") {
    throw new ParamError("date_basis must be posted or authorized");
  }
  const categories = await categoryTotals(month, dateBasis);
  return {
    month,
    dateBasis,
    total: categories.reduce((s, c) => s + c.total, 0),
    pendingTotal: categories.reduce((s, c) => s + c.pendingTotal, 0),
    categories,
  };
});
