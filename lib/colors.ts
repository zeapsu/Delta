export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

export function categoryColor(category: string, allCategories: string[]): string {
  const sorted = [...new Set(allCategories)].sort();
  const i = sorted.indexOf(category);
  return i >= 0 && i < 8 ? CHART_COLORS[i] : "var(--chart-muted)";
}
