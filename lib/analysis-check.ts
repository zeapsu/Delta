import assert from "node:assert";
import { ANALYSIS_DEFAULTS, analysisText, parseAnalysisSettings, withDefaults } from "./analysis";

// Defaults round-trip through validation.
assert.deepStrictEqual(parseAnalysisSettings(ANALYSIS_DEFAULTS), { ok: true, value: ANALYSIS_DEFAULTS });

// Every key required, whole numbers in range, no extras.
const bad = (body: unknown) => assert.strictEqual(parseAnalysisSettings(body).ok, false);
bad(null);
bad([]);
bad({ ...ANALYSIS_DEFAULTS, spikePct: undefined });
bad({ ...ANALYSIS_DEFAULTS, spikePct: 12.5 });
bad({ ...ANALYSIS_DEFAULTS, spikePct: "20" });
bad({ ...ANALYSIS_DEFAULTS, budgetWarnPct: 101 });
bad({ ...ANALYSIS_DEFAULTS, trendMonths: 1 });
bad({ ...ANALYSIS_DEFAULTS, extra: 1 });
assert.strictEqual(parseAnalysisSettings({ ...ANALYSIS_DEFAULTS, spikeMinDollars: 0 }).ok, true);

// Stored values: keep the valid ones, default the rest.
assert.deepStrictEqual(withDefaults(null), ANALYSIS_DEFAULTS);
assert.deepStrictEqual(withDefaults({ spikePct: 30, budgetWarnPct: -1 }), { ...ANALYSIS_DEFAULTS, spikePct: 30 });

// Singular month reads right.
assert.match(analysisText({ ...ANALYSIS_DEFAULTS, baselineMonths: 1 }), /prior 1 month \(/);

console.log("lib/analysis-check.ts: all assertions passed");
