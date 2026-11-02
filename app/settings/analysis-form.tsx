"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ANALYSIS_LIMITS,
  ANALYSIS_PRESETS,
  analysisSummary,
  presetFor,
  type AnalysisSettings,
} from "@/lib/analysis";

// One tap picks a preset (and saves); the exact numbers sit behind
// "Customize" as sentences with the numbers inline.
export function AnalysisForm({ initial }: { initial: AnalysisSettings }) {
  const router = useRouter();
  const [current, setCurrent] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [open, setOpen] = useState(presetFor(initial) === null);
  const [status, setStatus] = useState<{ saving?: boolean; saved?: boolean; error?: string }>({});
  const active = presetFor(current);

  const save = (analysis: AnalysisSettings) => {
    setStatus({ saving: true });
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to save");
        setCurrent(data.analysis);
        setDraft(data.analysis);
        setStatus({ saved: true });
        router.refresh();
      })
      .catch((err) => setStatus({ error: err.message }));
  };

  const num = (key: keyof AnalysisSettings, label: string, margin = "mx-1") => (
    <input
      type="number"
      step="1"
      min={ANALYSIS_LIMITS[key].min}
      max={ANALYSIS_LIMITS[key].max}
      required
      inputMode="numeric"
      aria-label={label}
      value={Number.isNaN(draft[key]) ? "" : draft[key]}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.valueAsNumber }))}
      className={`field ${margin} inline-block w-20! px-2 py-1 text-center tabular-nums`}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="How closely to watch" className="grid grid-cols-3 gap-2">
        {ANALYSIS_PRESETS.map((p) => {
          const on = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={status.saving}
              onClick={() => save(p.value)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-3 text-center transition-colors ${
                on ? "border-transparent bg-ink text-ink-foreground" : "border-hairline bg-fill hover:bg-fill-strong"
              }`}
            >
              <span className="text-sm font-semibold">{p.label}</span>
              <span className={`text-xs ${on ? "opacity-75" : "text-muted"}`}>{p.blurb}</span>
            </button>
          );
        })}
      </div>

      <p className="text-sm">
        {active === null ? <span className="font-medium">Custom. </span> : null}
        <span className="text-muted">{analysisSummary(current)}</span>
      </p>

      <div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="text-sm font-medium text-muted hover:text-foreground"
        >
          {open ? "Hide details" : "Customize"}
        </button>
        {open ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(draft);
            }}
            className="mt-3 flex flex-col gap-3 text-sm leading-9"
          >
            <p>
              Point out a category when it&apos;s{" "}
              <span className="whitespace-nowrap">{num("spikePct", "Percent above average")}%</span> and{" "}
              <span className="whitespace-nowrap">${num("spikeMinDollars", "Dollars above average", "ml-0.5 mr-1")}</span> over my{" "}
              <span className="whitespace-nowrap">{num("baselineMonths", "Months to average", "ml-1 mr-0.5")}-month</span> average.
            </p>
            <p>
              Call it a trend after <span className="whitespace-nowrap">{num("trendMonths", "Months for a trend")} months.</span>
            </p>
            <p>
              Warn me when a budget is{" "}
              <span className="whitespace-nowrap">{num("budgetWarnPct", "Budget warning percent")}% spent.</span>
            </p>
            <div>
              <button type="submit" disabled={status.saving} className="btn btn-primary">
                Save
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {status.saved || status.error ? (
        <p className={`text-sm ${status.error ? "text-negative" : "text-muted"}`}>
          {status.error ?? "Saved · applies next time your agent connects"}
        </p>
      ) : null}
    </div>
  );
}
