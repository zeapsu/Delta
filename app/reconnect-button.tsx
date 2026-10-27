"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";

// Re-authenticates an existing item through Plaid Link update mode (#62). The
// token is fetched on click (update-mode tokens are per item and short-lived),
// then Link opens as soon as it is ready. On success the item keeps its
// access token, so we only need to sync and refresh.
export default function ReconnectButton({ itemId }: { itemId: number }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: () => {
      setToken(null);
      fetch("/api/plaid/sync", { method: "POST" })
        .catch(() => undefined)
        .finally(() => {
          setBusy(false);
          router.refresh();
        });
    },
    onExit: () => {
      setToken(null);
      setBusy(false);
    },
  });

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  const start = () => {
    setBusy(true);
    setError(null);
    fetch("/api/plaid/link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("link token failed");
        return res.json();
      })
      .then((data) => setToken(data.link_token))
      .catch(() => {
        setBusy(false);
        setError("Could not start reconnect.");
      });
  };

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
      >
        {busy ? "Reconnecting…" : "Reconnect"}
      </button>
    </span>
  );
}
