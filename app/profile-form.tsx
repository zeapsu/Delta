"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const noSubscribe = () => () => {};

// Settings → You: name for the greeting and the time zone every date uses
// (PUT /api/settings/profile). The welcome page has its own name step.
export function ProfileForm({
  name: initialName,
  timeZone: initialZone,
  zones,
}: {
  name: string | null;
  timeZone: string;
  zones: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [zone, setZone] = useState(initialZone);
  // The browser's zone, null during the server render (it can't know it).
  const browserZone = useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
  const [status, setStatus] = useState<{ saving?: boolean; saved?: boolean; error?: string }>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ saving: true });
    fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, timeZone: zone }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't save");
        setStatus({ saved: true });
        router.refresh();
      })
      .catch((err) => setStatus({ error: err.message }));
  };

  const nameField = (
    <input
      className="field min-w-0 flex-1 text-base sm:text-sm"
      name="name"
      aria-label="Your name"
      placeholder="Your name"
      autoComplete="given-name"
      maxLength={40}
      value={name}
      onChange={(e) => setName(e.target.value)}
    />
  );
  const saved = status.saved || status.error ? (
    <p role="status" className={`text-sm ${status.error ? "text-negative" : "text-muted"}`}>
      {status.error ?? "Saved"}
    </p>
  ) : null;

  const options = zones.includes(zone) ? zones : [zone, ...zones];
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Name</span>
        {nameField}
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Time zone</span>
        <select className="field text-base sm:text-sm" value={zone} onChange={(e) => setZone(e.target.value)}>
          {options.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      {browserZone && browserZone !== zone && options.includes(browserZone) ? (
        <button type="button" className="btn btn-sm self-start" onClick={() => setZone(browserZone)}>
          Use this device&apos;s: {browserZone.replace(/_/g, " ")}
        </button>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={status.saving} className="btn btn-primary">
          Save
        </button>
        {saved}
      </div>
    </form>
  );
}
