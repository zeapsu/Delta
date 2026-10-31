// Analysis thresholds agents use (MCP instructions), editable on /settings.
// Pure: no DB imports, so lib/mcp.ts and the self-check can use it.
// Storage is lib/settings.ts; validation for the write route is here.

export type AnalysisSettings = {
  // Compare a month's category spend against the average of this many prior months.
  baselineMonths: number;
  // Flag a category when it is at least spikePct % AND spikeMinDollars above that average.
  spikePct: number;
  spikeMinDollars: number;
  // Call a trend real only with this many months of movement.
  trendMonths: number;
  // Heads-up once a budget is this % spent.
  budgetWarnPct: number;
};

// Defaults (checked 2026-10-31): Yodlee's "spending exceeded average" insight
// compares against a 3-month average and needs both a % and a dollar threshold
// (its defaults: 10% and $50). Monthly category spend routinely moves ~10%, so
// 20% keeps the agent from flagging most categories every month; the $50 floor
// stops small categories ($10 → $15) from counting. 80% is the usual
// "approaching budget" alert level.
export const ANALYSIS_DEFAULTS: AnalysisSettings = {
  baselineMonths: 3,
  spikePct: 20,
  spikeMinDollars: 50,
  trendMonths: 3,
  budgetWarnPct: 80,
};

export const ANALYSIS_LIMITS: Record<keyof AnalysisSettings, { min: number; max: number }> = {
  baselineMonths: { min: 1, max: 12 },
  spikePct: { min: 1, max: 500 },
  spikeMinDollars: { min: 0, max: 10_000 },
  trendMonths: { min: 2, max: 12 },
  budgetWarnPct: { min: 1, max: 100 },
};

const KEYS = Object.keys(ANALYSIS_DEFAULTS) as (keyof AnalysisSettings)[];

// Whole numbers within ANALYSIS_LIMITS, every key present, nothing extra.
export function parseAnalysisSettings(
  body: unknown,
): { ok: true; value: AnalysisSettings } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Invalid body" };
  }
  const obj = body as Record<string, unknown>;
  const extra = Object.keys(obj).find((k) => !KEYS.includes(k as keyof AnalysisSettings));
  if (extra) return { ok: false, error: `Unknown setting ${extra}` };
  const value = {} as AnalysisSettings;
  for (const k of KEYS) {
    const v = obj[k];
    const { min, max } = ANALYSIS_LIMITS[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      return { ok: false, error: `Invalid ${k} (whole number ${min}-${max})` };
    }
    value[k] = v;
  }
  return { ok: true, value };
}

// Stored JSON may predate a key or be hand-edited: fall back per key.
export function withDefaults(stored: unknown): AnalysisSettings {
  const obj = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const out = { ...ANALYSIS_DEFAULTS };
  for (const k of KEYS) {
    const v = obj[k];
    const { min, max } = ANALYSIS_LIMITS[k];
    if (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max) out[k] = v;
  }
  return out;
}

// The "Analysis:" paragraph of the MCP instructions.
export function analysisText(s: AnalysisSettings): string {
  const months = (n: number) => `${n} month${n === 1 ? "" : "s"}`;
  return `Analysis (the user's thresholds): call get_status first. Compare a month's categories against the average of the prior ${months(s.baselineMonths)} (spending_by_category with month=) and flag a category only when it is at least ${s.spikePct}% and $${s.spikeMinDollars} above that average. Call a trend real only with ${months(s.trendMonths)} or more of movement; the current month is partial. Give a heads-up when a budget is ${s.budgetWarnPct}% or more spent; over 100% is over budget. Confirmed recurring rules are the subscription list.`;
}

// One-tap choices on /settings; Balanced is the defaults. Watchful uses
// Yodlee's 10% with a lower $25 floor; Relaxed only speaks up for big moves.
export const ANALYSIS_PRESETS = [
  {
    id: "relaxed",
    label: "Relaxed",
    blurb: "Only big changes",
    value: { baselineMonths: 6, spikePct: 35, spikeMinDollars: 100, trendMonths: 4, budgetWarnPct: 90 },
  },
  { id: "balanced", label: "Balanced", blurb: "Recommended", value: ANALYSIS_DEFAULTS },
  {
    id: "watchful",
    label: "Watchful",
    blurb: "Smaller changes too",
    value: { baselineMonths: 3, spikePct: 10, spikeMinDollars: 25, trendMonths: 2, budgetWarnPct: 70 },
  },
] as const satisfies readonly { id: string; label: string; blurb: string; value: AnalysisSettings }[];

export function presetFor(s: AnalysisSettings): (typeof ANALYSIS_PRESETS)[number]["id"] | null {
  return ANALYSIS_PRESETS.find((p) => KEYS.every((k) => p.value[k] === s[k]))?.id ?? null;
}

// One plain sentence for the settings page.
export function analysisSummary(s: AnalysisSettings): string {
  return `Points out a category when it's ${s.spikePct}% and $${s.spikeMinDollars} over your ${s.baselineMonths}-month average, and warns when a budget is ${s.budgetWarnPct}% spent.`;
}
