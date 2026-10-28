"use client";

import { useState } from "react";
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

export function DeleteBudgetButton({ category }: { category: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    setError(null);
    setDeleting(true);
    fetch("/api/budgets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Delete failed");
        router.refresh();
      })
      .catch((err) => setError(err.message))
      .finally(() => setDeleting(false));
  };

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-negative">{error}</span>}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete ${formatCategory(category)} budget`}
        className="btn btn-sm btn-danger"
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </span>
  );
}
