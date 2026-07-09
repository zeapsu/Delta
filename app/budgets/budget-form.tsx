"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm opacity-60">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm opacity-60">Monthly amount ($)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={saving || !category}
        className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save budget"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
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
      {error && <span className="text-sm text-red-600">{error}</span>}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="text-sm text-red-600 disabled:opacity-50"
      >
        Delete
      </button>
    </span>
  );
}
