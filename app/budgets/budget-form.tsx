"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCategory } from "@/lib/format";

export function BudgetForm({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [category, setCategory] = useState(categories[0] ?? "");
  const [dollars, setDollars] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        monthlyAmount: Math.round(parseFloat(dollars) * 100),
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to save budget");
        }
        setDollars("");
        router.refresh();
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="field"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {formatCategory(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Monthly amount ($)</span>
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          className="field"
        />
      </label>
      <button
        type="submit"
        disabled={saving || !category}
        className="btn btn-primary"
      >
        {saving ? "Saving…" : "Save budget"}
      </button>
      {error && <p className="text-sm text-negative">{error}</p>}
    </form>
  );
}

// "Edit" on a budget card: change the amount, or delete, in one small sheet.
// Delete lives here rather than as a red button on every card.
export function EditBudgetButton({ category, monthlyAmount }: { category: string; monthlyAmount: number }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [dollars, setDollars] = useState((monthlyAmount / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = (method: "POST" | "DELETE") => {
    setBusy(true);
    setError(null);
    fetch("/api/budgets", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        method === "POST" ? { category, monthlyAmount: Math.round(parseFloat(dollars) * 100) } : { category },
      ),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save");
        dialog.current?.close();
        router.refresh();
      })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Edit ${formatCategory(category)} budget`}
        className="text-xs text-muted hover:text-foreground"
      >
        Edit
      </button>
      <dialog
        ref={dialog}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="glass sheet mx-auto mt-auto mb-0 w-full max-w-none rounded-t-3xl rounded-b-none p-0 pb-[env(safe-area-inset-bottom)] text-foreground sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-sm sm:rounded-3xl sm:pb-0"
      >
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            send("POST");
          }}
        >
          <div tabIndex={-1} className="outline-none">
            <p className="eyebrow">Monthly budget</p>
            <p className="text-base font-semibold">{formatCategory(category)}</p>
          </div>
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            inputMode="decimal"
            aria-label="Monthly amount in dollars"
            className="field text-base sm:w-full sm:text-sm"
          />
          {error && <p className="text-sm text-negative">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn btn-primary flex-1">
              Save
            </button>
            <button type="button" onClick={() => dialog.current?.close()} className="btn flex-1">
              Cancel
            </button>
          </div>
          <button type="button" disabled={busy} onClick={() => send("DELETE")} className="self-start text-xs text-negative">
            Delete budget
          </button>
        </form>
      </dialog>
    </>
  );
}
