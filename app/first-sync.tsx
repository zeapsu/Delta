"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Right after linking, Plaid is still pulling the history (the first sync
// often returns nothing). Keep syncing every 30s for ~5 minutes so the
// checklist step flips to done on its own, then fall back to a button.
const EVERY_MS = 30_000;
const TRIES = 10;

export function FirstSync() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tries >= TRIES) return;
    const t = setTimeout(() => {
      setBusy(true);
      fetch("/api/plaid/sync", { method: "POST" })
        .catch(() => null)
        .finally(() => {
          setBusy(false);
          setTries((n) => n + 1);
          router.refresh();
        });
    }, tries === 0 ? 5_000 : EVERY_MS);
    return () => clearTimeout(t);
  }, [tries, router]);

  if (tries < TRIES) {
    return (
      <span role="status" className="flex items-center gap-1.5 text-xs text-muted">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-current ${busy ? "animate-pulse" : "opacity-50"}`} />
        {busy ? "Checking…" : "Waiting for Plaid"}
      </span>
    );
  }
  return (
    <button type="button" className="btn btn-sm" onClick={() => setTries(0)}>
      Check again
    </button>
  );
}
