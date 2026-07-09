"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";

export default function PlaidButtons() {
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
    (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setError(null);
      fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token,
          institution_name: metadata.institution?.name,
        }),
      })
        .then((res) => {
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
      .then((res) => {
        if (!res.ok) throw new Error("Sync failed");
        return res.json();
      })
      .then((data) => {
        setSyncResult(`+${data.added} / ~${data.modified} / -${data.removed}`);
        router.refresh();
      })
      .catch(() => setError("Sync failed."))
      .finally(() => setSyncing(false));
  }, [router]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => open()}
          disabled={!ready || !linkToken}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Connect account
        </button>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        {syncResult && (
          <span className="text-sm opacity-60">{syncResult}</span>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
