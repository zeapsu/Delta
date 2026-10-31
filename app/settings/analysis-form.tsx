"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ANALYSIS_DEFAULTS, ANALYSIS_LIMITS, type AnalysisSettings } from "@/lib/analysis";

const FIELDS: { key: keyof AnalysisSettings; label: string; unit: string; help: string }[] = [
  {
    key: "baselineMonths",
    label: "Compare against",
    unit: "months",
    help: "Each month's categories are compared with the average of this many earlier months.",
  },
  {
    key: "spikePct",
    label: "Flag a category above average by",
    unit: "%",
    help: "Both this and the dollar amount below must be exceeded.",
  },
  {
    key: "spikeMinDollars",
    label: "…and by at least",
    unit: "$",
    help: "Keeps small categories from being flagged over a few dollars.",
  },
  {
    key: "trendMonths",
    label: "Call it a trend after",
    unit: "months",
    help: "Fewer months of movement is treated as noise.",
  },
  {
    key: "budgetWarnPct",
    label: "Budget heads-up at",
    unit: "% spent",
    help: "Over 100% is always reported as over budget.",
  },
];

const toText = (s: AnalysisSettings) =>
  Object.fromEntries(FIELDS.map((f) => [f.key, String(s[f.key])])) as Record<keyof AnalysisSettings, string>;

export function AnalysisForm({ initial }: { initial: AnalysisSettings }) {
  const router = useRouter();
  const [values, setValues] = useState(() => toText(initial));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = (analysis: Record<string, number>) => {
    setError(null);
    setSaved(false);
    setSaving(true);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to save");
        setValues(toText(data.analysis));
        setSaved(true);
        router.refresh();
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save(Object.fromEntries(FIELDS.map((f) => [f.key, Number(values[f.key])])));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {FIELDS.map((f) => {
        const { min, max } = ANALYSIS_LIMITS[f.key];
        return (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="eyebrow">{f.label}</span>
            <span className="flex items-center gap-2">
              {f.unit === "$" ? <span className="text-sm text-muted">$</span> : null}
              <input
                type="number"
                step="1"
                min={min}
                max={max}
                required
                inputMode="numeric"
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="field w-28"
              />
              {f.unit !== "$" ? <span className="text-sm text-muted">{f.unit}</span> : null}
              <span className="text-xs text-muted">default {ANALYSIS_DEFAULTS[f.key]}</span>
            </span>
            <span className="text-xs text-muted">{f.help}</span>
          </label>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={saving} onClick={() => save(ANALYSIS_DEFAULTS)} className="btn">
          Use defaults
        </button>
        {saved && <span className="text-sm text-positive">Saved. Agents pick this up when they reconnect.</span>}
        {error && <span className="text-sm text-negative">{error}</span>}
      </div>
    </form>
  );
}
