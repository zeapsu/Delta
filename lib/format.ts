// Account types whose balances are stored as positive amounts owed, so they
// count against net worth. Single source of truth — SQL IN(...) lists are
// built from this too (see app/net-worth/page.tsx).
export const DEBT_TYPES = new Set(["credit", "loan"]);

export function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCategory(category: string | null): string {
  if (category === null) return "Uncategorized";
  const lower = category.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
