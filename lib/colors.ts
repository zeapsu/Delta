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

// A category keeps one hue in every month and on every page. Green and red
// mean money in / over budget elsewhere, so the everyday categories get the
// other six hues and only rare ones fall back to those two.
const PINNED: Record<string, number> = {
  RENT_AND_UTILITIES: 1,
  FOOD_AND_DRINK: 3,
  TRANSPORTATION: 5,
  GENERAL_MERCHANDISE: 7,
  ENTERTAINMENT: 8,
  PERSONAL_CARE: 2,
  TRAVEL: 4,
  MEDICAL: 6,
};

export function categoryColor(category: string, allCategories: string[]): string {
  const pinned = PINNED[category];
  if (pinned) return `var(--chart-${pinned})`;
  // Unpinned categories take the slots this page's pinned ones leave free.
  const taken = new Set(allCategories.map((c) => PINNED[c]).filter(Boolean));
  const free = [1, 3, 5, 7, 8, 2, 4, 6].filter((n) => !taken.has(n));
  const rest = [...new Set(allCategories)].filter((c) => !PINNED[c]).sort();
  const i = rest.indexOf(category);
  return i >= 0 && i < free.length ? `var(--chart-${free[i]})` : "var(--chart-muted)";
}
