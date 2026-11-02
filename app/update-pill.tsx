"use client";

import { useState } from "react";
import { copy } from "./ask-agent";

const COMMAND = "./delta.sh update";

// Subtle "Update" pill in the header when the build is behind main
// (lib/update-check.ts). It can't update by itself (that would need Docker
// control, i.e. root, from an app with no login), so it copies the command
// to run on the host.
export function UpdatePill({ behindBy }: { behindBy: number }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const what = `${behindBy} update${behindBy === 1 ? "" : "s"} available`;

  async function onClick() {
    setState((await copy(COMMAND)) ? "copied" : "failed");
    setTimeout(() => setState("idle"), 2400);
  }

  const label = state === "copied" ? "Copied" : state === "failed" ? COMMAND : "Update";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${what}. Click to copy "${COMMAND}", then run it in your Delta folder on the host.`}
      aria-label={state === "idle" ? `Update: ${what}, copy the update command` : label}
      className="glass ml-auto flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted transition-colors hover:text-foreground"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--positive)]" />
      <span aria-live="polite" className={state === "failed" ? "font-mono text-xs" : undefined}>
        {label}
      </span>
    </button>
  );
}
