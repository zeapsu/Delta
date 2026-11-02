"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Env = "sandbox" | "production";

// Paste Plaid keys, pick the environment, and Delta checks them with Plaid
// before saving (PUT /api/settings/plaid). Used by /setup and /settings.
export function PlaidKeysForm({
  initialEnv = "sandbox",
  lockedEnv,
  submitLabel = "Save",
  next,
}: {
  initialEnv?: Env;
  // Banks are linked: switching environments needs a fresh install.
  lockedEnv?: boolean;
  submitLabel?: string;
  // Where to go once saved (else stay and refresh).
  next?: string;
}) {
  const router = useRouter();
  const [env, setEnv] = useState<Env>(initialEnv);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<{ saving?: boolean; saved?: boolean; error?: string }>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ saving: true });
    fetch("/api/settings/plaid", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ env, clientId, secret }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't save the keys");
        setSecret("");
        setStatus({ saved: true });
        if (next) router.push(next);
        else router.refresh();
      })
      .catch((err) => setStatus({ error: err.message }));
  };

  const envs: { id: Env; label: string; blurb: string }[] = [
    { id: "sandbox", label: "Sandbox", blurb: "Test banks" },
    { id: "production", label: "Production", blurb: "Real accounts" },
  ];

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Plaid environment" className="grid grid-cols-2 gap-2">
        {envs.map((o) => {
          const on = env === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={status.saving || (lockedEnv && !on)}
              onClick={() => setEnv(o.id)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-3 text-center transition-colors disabled:opacity-50 ${
                on ? "border-transparent bg-ink text-ink-foreground" : "border-hairline bg-fill hover:bg-fill-strong"
              }`}
            >
              <span className="text-sm font-semibold">{o.label}</span>
              <span className={`text-xs ${on ? "opacity-75" : "text-muted"}`}>{o.blurb}</span>
            </button>
          );
        })}
      </div>
      {lockedEnv ? (
        <p className="text-xs text-muted">Locked while banks are linked.</p>
      ) : null}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">client_id</span>
        <input
          className="field text-base sm:text-sm"
          name="clientId"
          autoComplete="off"
          spellCheck={false}
          required
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{env === "production" ? "Production" : "Sandbox"} secret</span>
        <input
          className="field text-base sm:text-sm"
          name="secret"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={status.saving} className="btn btn-primary">
          {status.saving ? "Checking…" : submitLabel}
        </button>
        {status.saved || status.error ? (
          <p role="status" className={`text-sm ${status.error ? "text-negative" : "text-muted"}`}>
            {status.error ?? "Saved"}
          </p>
        ) : null}
      </div>
    </form>
  );
}
