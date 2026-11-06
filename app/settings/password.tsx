"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DOCS = "https://zeapsu.github.io/Delta/docs/login";

// Settings → Password: turn the web UI login on, change it, turn it off
// (PUT/DELETE /api/settings/password), log out. Agent tokens are unaffected.
export function PasswordSettings({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "change" | "off">("idle");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<{ busy?: boolean; error?: string; done?: string }>({});

  const send = (method: "PUT" | "DELETE", body: object, done: string) => {
    setStatus({ busy: true });
    fetch("/api/settings/password", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't save");
        setMode("idle");
        setCurrent("");
        setPassword("");
        setStatus({ done });
        router.refresh();
      })
      .catch((err) => setStatus({ error: err.message }));
  };

  const logOut = () => {
    setStatus({ busy: true });
    fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/login"));
  };

  const field = (label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="password"
        className="field text-base sm:text-sm"
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
  const message = status.error || status.done ? (
    <p role="status" className={`text-sm ${status.error ? "text-negative" : "text-muted"}`}>
      {status.error ?? status.done}
    </p>
  ) : null;
  const cancel = (
    <button type="button" className="btn" onClick={() => (setMode("idle"), setStatus({}))}>
      Cancel
    </button>
  );
  const forgot = (
    <p className="text-xs text-muted">
      Agents keep using their tokens. Forgot it?{" "}
      <a className="underline" href={DOCS} target="_blank" rel="noreferrer">
        Reset from the host
      </a>
    </p>
  );

  if (!enabled) {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => (e.preventDefault(), send("PUT", { password }, "Password on"))}
      >
        <p className="text-sm text-muted">Off. Anyone who can reach Delta can open it.</p>
        {field("New password", password, setPassword, "new-password")}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={status.busy} className="btn btn-primary">
            Turn on
          </button>
          {message}
        </div>
        {forgot}
      </form>
    );
  }

  if (mode === "change" || mode === "off") {
    const off = mode === "off";
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (off) send("DELETE", { current }, "Password off");
          else send("PUT", { current, password }, "Password changed. Other devices are logged out.");
        }}
      >
        {field("Current password", current, setCurrent, "current-password")}
        {off ? null : field("New password", password, setPassword, "new-password")}
        <div className="flex flex-wrap items-center gap-3">
          {cancel}
          <button type="submit" disabled={status.busy} className={`btn ${off ? "btn-danger" : "btn-primary"}`}>
            {off ? "Turn off" : "Change"}
          </button>
          {message}
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">On. Each device stays logged in for 30 days.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={() => (setMode("change"), setStatus({}))}>
          Change
        </button>
        <button type="button" className="btn" onClick={() => (setMode("off"), setStatus({}))}>
          Turn off
        </button>
        <button type="button" className="btn" disabled={status.busy} onClick={logOut}>
          Log out
        </button>
        {message}
      </div>
      {forgot}
    </div>
  );
}
