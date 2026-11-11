"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";

// connectOnly: just the Connect button (nothing to sync before the first link).
// compact: small, quiet buttons for a section header (the Accounts row).
export default function PlaidButtons({ connectOnly = false, compact = false }: { connectOnly?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plaid/link-token", { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to create link token");
        return res.json();
      })
      .then((data) => setLinkToken(data.link_token))
      .catch(() => setError("Could not start Plaid Link."));
  }, []);

  const onSuccess = useCallback(
    (public_token: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      setError(null);
      // react-plaid-link 5 allows null for flows that don't create an Item;
      // linking a bank always creates one, so treat a missing token as a failure.
      if (!public_token) {
        setError("Failed to link account.");
        return;
      }
      fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token,
          institution_name: metadata.institution?.name,
        }),
      })
        .then(async (res) => {
          // 409: this bank is already connected, and the server says which.
          if (res.status === 409) return setError(`${(await res.json()).error}.`);
          if (!res.ok) throw new Error("Exchange failed");
          router.refresh();
        })
        .catch(() => setError("Failed to link account."));
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
  });

  const handleSync = useCallback(() => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    fetch("/api/plaid/sync", { method: "POST" })
      // 502 = some items failed but the rest synced; the body still has counts.
      .then((res) => {
        if (!res.ok && res.status !== 502) throw new Error("Sync failed");
        return res.json();
      })
      .then((data) => {
        setSyncResult(
          `Synced · ${data.added} new, ${data.modified} updated, ${data.removed} removed`,
        );
        if (data.errors?.length) {
          setError(
            `Sync failed for ${data.errors
              .map((e: { institution: string | null; error_code: string }) =>
                `${e.institution ?? "an account"} (${e.error_code})`)
              .join(", ")}.`,
          );
        }
        router.refresh();
      })
      .catch(() => setError("Sync failed."))
      .finally(() => setSyncing(false));
  }, [router]);

  return (
    <div className={`flex flex-col gap-2 ${compact ? "items-end" : "items-start sm:items-end"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {syncResult && <span className="text-xs text-muted">{syncResult}</span>}
        {connectOnly ? null : (
          <button type="button" onClick={handleSync} disabled={syncing} className={compact ? "btn btn-sm" : "btn"}>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
        <button
          type="button"
          onClick={() => open()}
          disabled={!ready || !linkToken}
          className={compact ? "btn btn-sm" : "btn btn-primary"}
        >
          + Connect account
        </button>
      </div>
      {error && <p className="text-sm text-negative">{error}</p>}
    </div>
  );
}
