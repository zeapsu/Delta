"use client";

import { useEffect, useRef, useState } from "react";
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
  const [message, setMessage] = useState<string | null>(null);
  // Clearing the token after success force-exits Link, which may fire onExit
  // while the sync is still running; this keeps busy set until it finishes.
  const succeeded = useRef(false);

  const { open, ready, error: linkError } = usePlaidLink({
    token,
    onSuccess: () => {
      succeeded.current = true;
      setToken(null);
      fetch("/api/plaid/sync", { method: "POST" })
        // 502 = some items failed; the body names them (see plaid-buttons.tsx).
        .then((res) => (res.ok || res.status === 502 ? res.json() : Promise.reject()))
        .then((data) => {
          const failed = (data.errors ?? []).find(
            (e: { itemId: number }) => e.itemId === itemId,
          );
          setMessage(failed ? `Still failing (${failed.error_code}).` : null);
        })
        .catch(() => setMessage("Reconnected, but the sync failed."))
        .finally(() => {
          succeeded.current = false;
          setBusy(false);
          router.refresh();
        });
    },
    onExit: () => {
      if (succeeded.current) return;
      setToken(null);
      setBusy(false);
    },
  });

  // When the token changes, the hook first hands back the previous (destroyed)
  // handler, whose open() is a no-op; the next render brings the new one.
  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  // The Link script failed to load (offline, blocked): never leave the button stuck.
  useEffect(() => {
    if (token && linkError) {
      setToken(null);
      setBusy(false);
      setMessage("Could not load Plaid Link.");
    }
  }, [token, linkError]);

  const start = () => {
    setBusy(true);
    setMessage(null);
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
        setMessage("Could not start reconnect.");
      });
  };

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
      >
        {busy ? "Reconnecting…" : "Reconnect"}
      </button>
      {message && <span className="text-xs text-red-600">{message}</span>}
    </span>
  );
}
