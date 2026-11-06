"use client";

import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<{ busy?: boolean; error?: string }>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ busy: true });
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't log in");
        // A full load, so the layout and nav render as logged in.
        window.location.assign(next);
      })
      .catch((err) => setStatus({ error: err.message }));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Log in</h2>
      <input
        type="password"
        className="field text-base sm:text-sm"
        name="password"
        aria-label="Password"
        placeholder="Password"
        autoComplete="current-password"
        autoFocus
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={status.busy} className="btn btn-primary">
          Log in
        </button>
        {status.error ? (
          <p role="status" className="text-sm text-negative">
            {status.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
