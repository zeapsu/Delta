"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/format";

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

const inputClass = "w-full rounded-md border px-3 py-2 text-base sm:w-auto sm:text-sm";
const buttonClass = "rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50";

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
      <div className="flex flex-col gap-1">
        <label className="text-sm opacity-60">Name</label>
        <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm opacity-60">Amount ($)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm opacity-60">Every (days)</label>
        <input
          type="number"
          min="1"
          max="1000"
          required
          value={gapDays}
          onChange={(e) => setGapDays(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm opacity-60">Last charge</label>
        <input
          type="date"
          required
          value={anchorDate}
          onChange={(e) => setAnchorDate(e.target.value)}
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={saving} className={buttonClass}>
        {saving ? "Saving…" : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
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
    <div className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm">
        Is <span className="font-medium">{suggestion.merchant}</span> (~{formatCents(suggestion.amount)},{" "}
        {suggestion.cadence}, seen {suggestion.count}×) a recurring transaction?
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
          <button type="button" onClick={() => setConfirming(true)} className={buttonClass}>
            Yes
          </button>
          <button type="button" onClick={handleNo} disabled={dismissing} className={buttonClass}>
            {dismissing ? "Dismissing…" : "No"}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
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
      <tr className="border-b border-zinc-100 dark:border-zinc-900">
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
    <tr className="border-b border-zinc-100 dark:border-zinc-900">
      <td className="py-2 pr-4">{rule.name}</td>
      <td className="py-2 pr-4">{formatCents(rule.amount)}</td>
      <td className="py-2 pr-4 capitalize">{cadence}</td>
      <td className="py-2 pr-4">{lastDate ?? "—"}</td>
      <td className="py-2 pr-4">{nextDate}</td>
      <td className="py-2">
        <span className="flex items-center gap-3">
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button type="button" onClick={() => setEditing(true)} className="text-sm underline opacity-70">
            Edit
          </button>
          <button type="button" onClick={handleDelete} disabled={deleting} className="text-sm text-red-600 disabled:opacity-50">
            Delete
          </button>
        </span>
      </td>
    </tr>
  );
}
