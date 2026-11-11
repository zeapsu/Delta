"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";

type SyncError = { itemId: number; error_code: string };

function syncItem(itemId: number): Promise<SyncError | null> {
  return fetch("/api/plaid/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id: itemId }),
  })
    // 502 = the item failed; the body names the error.
    .then((res) => (res.ok || res.status === 502 ? res.json() : Promise.reject()))
    .then(
      (data) =>
        (data.errors ?? []).find((e: SyncError) => e.itemId === itemId) ?? null,
    );
}

const SyncIcon = ({ spinning }: { spinning: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
    <path d="M3 21v-5h5" />
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
);

const MoreIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="currentColor">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
);

// Per-connection control. Healthy: a quiet sync icon that refreshes just this
// connection. When Plaid says the user must log in again (needsReauth), it
// becomes a red Reconnect pill that runs Link update mode (#62) — the item
// keeps its access token, so success only needs a sync and a refresh.
// Beside it, "⋯" opens a sheet where the connection can be removed: the
// destructive step sits behind the sheet and a second, spelled-out confirm.
export default function ConnectionButton({
  itemId,
  institution,
  accountCount,
  needsReauth,
  transientError,
  syncedLabel,
}: {
  itemId: number;
  institution: string;
  accountCount: number;
  needsReauth: boolean;
  transientError: string | null;
  syncedLabel: string | null;
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Clearing the token after success force-exits Link, which may fire onExit
  // while the sync is still running; this keeps busy set until it finishes.
  const succeeded = useRef(false);
  const sheet = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const { open, ready, error: linkError } = usePlaidLink({
    token,
    onSuccess: () => {
      succeeded.current = true;
      setToken(null);
      syncItem(itemId)
        .then((failed) => setMessage(failed ? `Still failing (${failed.error_code}).` : null))
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

  // The Link script failed to load (offline, blocked): Link will never become
  // ready, so don't leave the button stuck on "Reconnecting…".
  const loadFailed = Boolean(token && linkError);
  const working = busy && !loadFailed;
  const shown = loadFailed ? "Could not load Plaid Link." : message;

  const reconnect = () => {
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

  const refresh = () => {
    setBusy(true);
    setMessage(null);
    syncItem(itemId)
      .then((failed) => setMessage(failed ? `Sync failed (${failed.error_code}).` : null))
      .catch(() => setMessage("Sync failed."))
      .finally(() => {
        setBusy(false);
        // a new error may flip this connection into the Reconnect state
        router.refresh();
      });
  };

  const remove = () => {
    setRemoving(true);
    setRemoveError(null);
    fetch("/api/plaid/items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not remove it. Try again.");
        sheet.current?.close();
        router.refresh();
      })
      .catch((err) => setRemoveError(err.message))
      .finally(() => setRemoving(false));
  };

  const accountsLabel = `${accountCount} ${accountCount === 1 ? "account" : "accounts"}`;

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1">
      {needsReauth ? (
        <button
          type="button"
          onClick={reconnect}
          disabled={working}
          title={`Sign in to ${institution} again`}
          className="btn btn-sm border-transparent bg-red-600 text-white hover:bg-red-600 hover:opacity-90"
        >
          {working ? "Reconnecting…" : "Reconnect"}
        </button>
      ) : (
        <button
          type="button"
          onClick={refresh}
          disabled={working}
          aria-label={`Sync ${institution}`}
          title={
            transientError
              ? `Last sync failed (${transientError}). Click to retry.`
              : syncedLabel
                ? `Synced ${syncedLabel}. Click to sync now.`
                : "Sync now"
          }
          className="btn btn-sm relative h-8 w-8 p-0"
        >
          <SyncIcon spinning={working} />
          {transientError ? (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-solid)] bg-warning" />
          ) : null}
        </button>
      )}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Manage ${institution}`}
          title="Manage connection"
          onClick={() => {
            setConfirming(false);
            setRemoveError(null);
            sheet.current?.showModal();
          }}
          className="flex h-8 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-fill hover:text-foreground"
        >
          <MoreIcon />
        </button>
      </span>
      {shown && <span className="text-xs text-negative">{shown}</span>}

      <dialog
        ref={sheet}
        aria-label={`Manage ${institution}`}
        onClick={(e) => e.target === sheet.current && !removing && sheet.current?.close()}
        className="glass sheet mx-auto mt-auto mb-0 w-full max-w-none rounded-t-3xl rounded-b-none p-0 pb-[env(safe-area-inset-bottom)] text-left text-foreground sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-sm sm:rounded-3xl sm:pb-0"
      >
        <div className="flex flex-col gap-4 p-5">
          {/* Takes the dialog's initial focus, so Remove is never one Enter away. */}
          <div tabIndex={-1} className="outline-none">
            <p className="eyebrow">{confirming ? "Remove connection" : "Connection"}</p>
            <p className="text-base font-semibold">{confirming ? `Remove ${institution}?` : institution}</p>
            <p className="mt-1 text-sm text-muted">
              {confirming
                ? `Deletes its ${accountsLabel}, balances and transactions from Delta. Connecting it again brings back about two years. Budgets and recurring charges stay.`
                : `${accountsLabel}${syncedLabel ? ` · synced ${syncedLabel}` : ""}`}
            </p>
          </div>
          {removeError && <p className="text-sm text-negative">{removeError}</p>}
          {confirming ? (
            <div className="flex gap-2">
              <button type="button" onClick={remove} disabled={removing} className="btn btn-danger flex-1">
                {removing ? "Removing…" : "Remove"}
              </button>
              <button type="button" onClick={() => sheet.current?.close()} disabled={removing} className="btn flex-1">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(true)} className="btn flex-1 text-negative">
                Remove connection
              </button>
              <button type="button" onClick={() => sheet.current?.close()} className="btn flex-1">
                Done
              </button>
            </div>
          )}
        </div>
      </dialog>
    </span>
  );
}
