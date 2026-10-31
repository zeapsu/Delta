import assert from "node:assert";
import { ANALYSIS_DEFAULTS, ANALYSIS_PRESETS, analysisText, parseAnalysisSettings, presetFor, withDefaults } from "./analysis";

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

// Presets are valid settings and recognized back; anything else is custom.
for (const p of ANALYSIS_PRESETS) {
  assert.strictEqual(parseAnalysisSettings(p.value).ok, true, p.id);
  assert.strictEqual(presetFor(p.value), p.id);
}
assert.strictEqual(presetFor(ANALYSIS_DEFAULTS), "balanced");
assert.strictEqual(presetFor({ ...ANALYSIS_DEFAULTS, spikePct: 21 }), null);

console.log("lib/analysis-check.ts: all assertions passed");
