"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";

// Opens Link update mode asking for investments consent on an existing item
// (same flow as reconnect-button.tsx, plus `investments: true`). The first
// investments call after consent often answers PRODUCT_NOT_READY, which the
// sync skips, so activity may only show up on the following sync.
export default function GrantInvestmentsButton({ itemId }: { itemId: number }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const succeeded = useRef(false);

  const { open, ready, error: linkError } = usePlaidLink({
    token,
    onSuccess: () => {
      succeeded.current = true;
      setToken(null);
      fetch("/api/plaid/sync", { method: "POST" })
        .then((res) => (res.ok || res.status === 502 ? res.json() : Promise.reject()))
        .then((data) =>
          setMessage(
            data.investments > 0
              ? null
              : "Access granted. Plaid can take a few minutes to prepare the data; sync again shortly.",
          ),
        )
        .catch(() => setMessage("Access granted, but the sync failed. Try syncing again."))
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

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  const loadFailed = Boolean(token && linkError);
  const working = busy && !loadFailed;
  const shown = loadFailed ? "Could not load Plaid Link." : message;

  const start = () => {
    setBusy(true);
    setMessage(null);
    fetch("/api/plaid/link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId, investments: true }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("link token failed");
        return res.json();
      })
      .then((data) => setToken(data.link_token))
      .catch(() => {
        setBusy(false);
        setMessage("Could not start Plaid Link.");
      });
  };

  return (
    <span className="flex flex-col items-start gap-1">
      <button type="button" onClick={start} disabled={working} className="btn btn-sm btn-primary">
        {working ? "Opening Plaid…" : "Grant investments access"}
      </button>
      {shown && <span className="text-xs text-muted">{shown}</span>}
    </span>
  );
}
