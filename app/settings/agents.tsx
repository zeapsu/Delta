"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { agentConfigs } from "@/lib/agent-config";
import { CopyButton } from "../copy-button";

type Scope = "read" | "write";
export type AgentRow = { id: number; name: string; prefix: string; scope: string; used: string };

const SCOPES: { id: Scope; label: string; blurb: string }[] = [
  { id: "read", label: "Read", blurb: "Sees your data" },
  { id: "write", label: "Read + edit", blurb: "Also budgets, recurring, categories" },
];
const scopeLabel = (s: string) => (s === "write" ? "Read + edit" : "Read");
const chip = "rounded-full border border-hairline bg-fill px-2.5 py-0.5 text-xs";

// Settings → Agents: create a token, copy a ready config, revoke. Same as
// `npm run token`, without a terminal (POST/DELETE /api/tokens).
export function Agents({ tokens, baseUrl }: { tokens: AgentRow[]; baseUrl: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("read");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't create the token");
        setCreated({ name: data.name, token: data.token });
        setName("");
        router.refresh();
      })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  };

  const revoke = (id: number) => {
    setBusy(true);
    setError(null);
    fetch(`/api/tokens/${id}`, { method: "DELETE" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't revoke it");
        setConfirming(null);
        router.refresh();
      })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex flex-col gap-5">
      {created ? (
        <NewToken name={created.name} token={created.token} baseUrl={baseUrl} onDone={() => setCreated(null)} />
      ) : null}

      {tokens.length ? (
        <ul className="flex flex-col divide-y divide-hairline">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 first:pt-0">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm font-medium">{t.name}</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`${chip} font-medium`}>{scopeLabel(t.scope)}</span>
                  <span className={`${chip} font-mono`}>{t.prefix}…</span>
                  <span className="text-xs text-muted">{t.used}</span>
                </div>
              </div>
              {confirming === t.id ? (
                <div className="flex items-center gap-2">
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => revoke(t.id)}>
                    Revoke
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  aria-label={`Revoke ${t.name}`}
                  onClick={() => setConfirming(t.id)}
                >
                  Revoke…
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : created ? null : (
        <p className="text-sm text-muted">No agents yet.</p>
      )}

      <form onSubmit={create} className="flex flex-col gap-3 border-t border-hairline pt-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">New agent</span>
          <input
            className="field text-base sm:text-sm"
            name="name"
            placeholder="Name, e.g. laptop"
            autoComplete="off"
            maxLength={60}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div role="radiogroup" aria-label="Access" className="grid grid-cols-2 gap-2">
          {SCOPES.map((o) => {
            const on = scope === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                onClick={() => setScope(o.id)}
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
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="btn btn-primary">
            Create token
          </button>
          {error ? (
            <p role="status" className="text-sm text-negative">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}

// Shown once, right after creating: the token inside each config format.
function NewToken({ name, token, baseUrl, onDone }: { name: string; token: string; baseUrl: string | null; onDone: () => void }) {
  const configs = agentConfigs(baseUrl ?? window.location.origin, token);
  const [tab, setTab] = useState(configs[0].id);
  const c = configs.find((x) => x.id === tab) ?? configs[0];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-fill p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{name} is ready</span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3.5M8 11h.01" strokeLinecap="round" />
          </svg>
          Shown once. Copy it now.
        </span>
      </div>
      <div role="group" aria-label="Config format" className="flex flex-wrap gap-1.5">
        {configs.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={x.id === tab}
            onClick={() => setTab(x.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              x.id === tab ? "bg-ink text-ink-foreground" : "border border-hairline hover:bg-fill-strong"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{c.hint}</p>
      <pre tabIndex={0} className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-background p-3 font-mono text-xs">{c.text}</pre>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={c.text} className="btn btn-sm btn-primary" />
        <CopyButton text={token} label="Copy token only" />
        <button type="button" className="btn btn-sm" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
