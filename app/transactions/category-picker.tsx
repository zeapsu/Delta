"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";
import { formatCategory } from "@/lib/format";

// Category pill on a transaction row; tapping it opens a glass sheet to
// relabel this transaction or every transaction from the merchant.
export function CategoryPicker({
  id,
  merchant,
  category,
  plaidCategory,
  overridden,
  ruleCategory,
  color,
  filterHref,
}: {
  id: number;
  merchant: string;
  category: string | null;
  plaidCategory: string | null;
  overridden: boolean;
  ruleCategory: string | null;
  color: string;
  filterHref: string | null;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState(category ?? "");
  const [allFromMerchant, setAllFromMerchant] = useState(ruleCategory !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relabeled = overridden || ruleCategory !== null;
  const options = category && !CATEGORIES.includes(category as never) ? [category, ...CATEGORIES] : CATEGORIES;

  const open = () => {
    setChoice(category ?? "");
    setAllFromMerchant(ruleCategory !== null);
    setError(null);
    dialog.current?.showModal();
  };

  // Resetting a row that only follows a merchant rule means dropping the rule.
  const resetMerchant = ruleCategory !== null && (allFromMerchant || !overridden);

  const save = (next: string | null, merchantWide: boolean) => {
    setSaving(true);
    setError(null);
    fetch("/api/transactions/category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category: next, merchant: merchantWide }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Couldn't save the category");
        }
        dialog.current?.close();
        router.refresh();
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="Change category"
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-fill px-2.5 py-1 text-xs hover:bg-fill-strong"
      >
        <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        {formatCategory(category)}
        {relabeled && (
          <span aria-label="relabeled" title="Relabeled by you" className="text-muted">
            ✎
          </span>
        )}
      </button>

      <dialog
        ref={dialog}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="glass m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl p-0 text-foreground backdrop:bg-black/30"
      >
        <form
          method="dialog"
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save(choice, allFromMerchant);
          }}
        >
          <div>
            <p className="eyebrow">Category</p>
            <p className="truncate text-base font-semibold">{merchant}</p>
            {plaidCategory !== category && (
              <p className="text-xs text-muted">Bank labeled it {formatCategory(plaidCategory)}</p>
            )}
          </div>

          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            required
            className="field text-base sm:text-sm"
          >
            <option value="" disabled>
              Pick a category
            </option>
            {options.map((c) => (
              <option key={c} value={c}>
                {formatCategory(c)}
              </option>
            ))}
          </select>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={allFromMerchant}
              onChange={(e) => setAllFromMerchant(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Every {merchant} transaction
              <span className="block text-xs text-muted">Past ones and new ones from future syncs</span>
            </span>
          </label>

          {error && <p className="text-sm text-negative">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={saving || !choice} className="btn btn-primary flex-1">
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => dialog.current?.close()} className="btn flex-1">
              Cancel
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            {relabeled ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => save(null, resetMerchant)}
                className="text-muted underline-offset-2 hover:underline"
              >
                {resetMerchant
                  ? `Use the bank's labels for ${merchant}`
                  : "Use the bank's label"}
              </button>
            ) : (
              <span />
            )}
            {filterHref && (
              <Link href={filterHref} className="text-muted underline-offset-2 hover:underline">
                All {formatCategory(category)}
              </Link>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
