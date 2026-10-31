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
}: {
  initial: { name: string; amount?: number; gapDays?: number; anchorDate?: string };
  submitLabel: string;
  onSubmit: (fields: { name: string; amount: number; gapDays: number; anchorDate: string }) => Promise<void>;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [dollars, setDollars] = useState(initial.amount != null ? (initial.amount / 100).toFixed(2) : "");
  const [gapDays, setGapDays] = useState(initial.gapDays != null ? String(Math.round(initial.gapDays)) : "");
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
        <span className="eyebrow">Every (days)</span>
        <input
          type="number"
          min="1"
          max="1000"
          required
          value={gapDays}
          onChange={(e) => setGapDays(e.target.value)}
          className={inputClass}
        />
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
      <p className="-mt-2 text-xs text-muted">
        Charged {suggestion.cadence}, seen {suggestion.count}× · last {suggestion.lastDate}. Is this a
        recurring bill or subscription?
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
            Yes, track it
          </button>
          <button type="button" onClick={handleNo} disabled={dismissing} className="btn btn-sm">
            {dismissing ? "Dismissing…" : "Not recurring"}
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

// Owns the whole table row so the edit form can replace it as a single
// full-width cell instead of exploding inside the actions column.
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
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    setError(null);
    setDeleting(true);
    postRule({ id: rule.id }, "DELETE")
      .then(() => router.refresh())
      .catch((err) => setError(err.message))
      .finally(() => setDeleting(false));
  };

  if (editing) {
    return (
      <tr className="border-b border-hairline last:border-0">
        <td colSpan={6} className="py-3">
          <RuleFields
            initial={rule}
            submitLabel="Save"
            onSubmit={(fields) => postRule({ id: rule.id, ...fields }, "PUT").then(() => router.refresh())}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-hairline last:border-0">
      <td className="py-2.5 pr-4 font-medium">{rule.name}</td>
      <td className="py-2.5 pr-4 tabular-nums">{formatCents(rule.amount)}</td>
      <td className="py-2.5 pr-4 capitalize text-muted">{cadence}</td>
      <td className="py-2.5 pr-4 text-muted">{lastDate ? shortDate(lastDate) : "—"}</td>
      <td className="py-2.5 pr-4">{nextDate ? shortDate(nextDate) : "—"}</td>
      <td className="py-2.5">
        <span className="flex items-center gap-3">
          {error && <span className="text-sm text-negative">{error}</span>}
          <button type="button" onClick={() => setEditing(true)} className="btn btn-sm">
            Edit
          </button>
          <button type="button" onClick={handleDelete} disabled={deleting} className="btn btn-sm btn-danger">
            Delete
          </button>
        </span>
      </td>
    </tr>
  );
}
