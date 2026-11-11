"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/format";
import { shortDate } from "@/lib/months";

type Suggestion = {
  matchKey: string;
  merchant: string;
  amount: number; // cents
  cadence: string;
  gapDays: number;
  lastDate: string;
  count: number;
};

type Rule = {
  id: number;
  name: string;
  amount: number; // cents
  gapDays: number;
  anchorDate: string;
};

const inputClass = "field";
const CADENCES: [number, string][] = [
  [7, "Weekly"],
  [14, "Every 2 weeks"],
  [30, "Monthly"],
  [91, "Every 3 months"],
  [365, "Yearly"],
];
// Detected gaps are averages (29.6 days); snap to the named cadence within 10%.
const snap = (gap: number) => CADENCES.find(([d]) => Math.abs(d - gap) / d < 0.1)?.[0] ?? Math.round(gap);
const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full bg-fill-strong px-2 py-0.5 text-xs text-muted">{children}</span>
);
const buttonClass = "btn";

function postRule(body: Record<string, unknown>, method: string) {
  return fetch("/api/recurring", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Failed to save");
    }
  });
}

// Editable name/amount/gap-days/anchor fields shared by suggestion-confirm,
// manual add, and edit. Submits POST (create) or PUT (edit) to /api/recurring.
function RuleFields({
  initial,
  submitLabel,
  onSubmit,
  onDone,
  onCancel,
  onDelete,
}: {
  initial: { name: string; amount?: number; gapDays?: number; anchorDate?: string };
  submitLabel: string;
  onSubmit: (fields: { name: string; amount: number; gapDays: number; anchorDate: string }) => Promise<void>;
  onDone?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [dollars, setDollars] = useState(initial.amount != null ? (initial.amount / 100).toFixed(2) : "");
  const [gapDays, setGapDays] = useState(initial.gapDays != null ? String(snap(initial.gapDays)) : "");
  const [anchorDate, setAnchorDate] = useState(initial.anchorDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    onSubmit({
      name,
      amount: Math.round(parseFloat(dollars) * 100),
      gapDays: parseInt(gapDays, 10),
      anchorDate,
    })
      .then(() => onDone?.())
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Name</span>
        <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Amount ($)</span>
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Repeats</span>
        <select required value={gapDays} onChange={(e) => setGapDays(e.target.value)} className={inputClass}>
          <option value="" disabled>
            Pick one
          </option>
          {CADENCES.map(([days, label]) => (
            <option key={days} value={days}>
              {label}
            </option>
          ))}
          {gapDays && !CADENCES.some(([d]) => String(d) === gapDays) ? (
            <option value={gapDays}>Every {gapDays} days</option>
          ) : null}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Last charge</span>
        <input
          type="date"
          required
          value={anchorDate}
          onChange={(e) => setAnchorDate(e.target.value)}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={saving} className="btn btn-primary">
        {saving ? "Saving…" : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} className="px-2 py-2 text-sm text-negative sm:ml-auto">
          Stop tracking
        </button>
      )}
      {error && <p className="text-sm text-negative">{error}</p>}
    </form>
  );
}

export function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);

  const handleNo = () => {
    setError(null);
    setDismissing(true);
    postRule(
      {
        status: "dismissed",
        matchKey: suggestion.matchKey,
        name: suggestion.merchant,
        amount: suggestion.amount,
        gapDays: Math.max(1, Math.round(suggestion.gapDays)),
        anchorDate: suggestion.lastDate,
      },
      "POST",
    )
      .then(() => router.refresh())
      .catch((err) => setError(err.message))
      .finally(() => setDismissing(false));
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-fill p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{suggestion.merchant}</p>
        <p className="text-sm tabular-nums">~{formatCents(suggestion.amount)}</p>
      </div>
      <p className="-mt-1 flex flex-wrap gap-1.5">
        <Chip>{suggestion.cadence.charAt(0).toUpperCase() + suggestion.cadence.slice(1)}</Chip>
        <Chip>{suggestion.count} charges</Chip>
        <Chip>Last {shortDate(suggestion.lastDate)}</Chip>
      </p>
      {confirming ? (
        <RuleFields
          initial={{
            name: suggestion.merchant,
            amount: suggestion.amount,
            gapDays: suggestion.gapDays,
            anchorDate: suggestion.lastDate,
          }}
          submitLabel="Confirm"
          onSubmit={(fields) =>
            postRule({ status: "confirmed", matchKey: suggestion.matchKey, ...fields }, "POST").then(() =>
              router.refresh(),
            )
          }
        />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setConfirming(true)} className="btn btn-primary btn-sm">
            Track
          </button>
          <button type="button" onClick={handleNo} disabled={dismissing} className="btn btn-sm">
            {dismissing ? "Dismissing…" : "Dismiss"}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-negative">{error}</p>}
    </div>
  );
}

export function AddRuleForm() {
  const router = useRouter();
  return (
    <RuleFields
      initial={{ name: "" }}
      submitLabel="Add recurring"
      onSubmit={(fields) => postRule({ status: "confirmed", ...fields }, "POST").then(() => router.refresh())}
    />
  );
}

// One tracked charge: next date as a tile, name, cadence and amount. "Edit"
// swaps the row for the form, which is also where "Stop tracking" lives.
export function RuleRow({
  rule,
  cadence,
  lastDate,
  nextDate,
}: {
  rule: Rule;
  cadence: string;
  lastDate?: string;
  nextDate?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    postRule({ id: rule.id }, "DELETE")
      .then(() => router.refresh())
      .catch((err) => setError(err.message));
  };

  if (editing) {
    return (
      <li className="py-3">
        <RuleFields
          initial={rule}
          submitLabel="Save"
          onSubmit={(fields) => postRule({ id: rule.id, ...fields }, "PUT").then(() => router.refresh())}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
          onDelete={handleDelete}
        />
        {error && <p className="mt-2 text-sm text-negative">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <span className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-fill py-1 text-center leading-tight">
        {nextDate ? (
          <>
            <span className="text-[10px] uppercase text-muted">{shortDate(nextDate).split(" ")[0]}</span>
            <span className="font-semibold">{Number(nextDate.slice(8))}</span>
          </>
        ) : (
          <span className="py-1.5 text-muted">—</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{rule.name}</span>
        <span className="text-xs capitalize text-muted">
          {cadence}
          {lastDate ? <span className="normal-case"> · last {shortDate(lastDate)}</span> : null}
        </span>
      </span>
      <span className="tabular-nums font-medium">{formatCents(rule.amount)}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${rule.name}`}
        className="text-xs text-muted hover:text-foreground"
      >
        Edit
      </button>
    </li>
  );
}
