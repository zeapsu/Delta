"use client";

import { useState } from "react";
import { copy } from "./ask-agent";

const DELTA_SH = "./delta.sh update";
const BREW = "delta backup && brew upgrade delta && brew services restart delta";
// Home server app (stack) installs update from their app panel, not a shell.
const STACK_GUIDE = "https://zeapsu.github.io/Delta/docs/home-server#update";

// Subtle "Update" pill in the header when the build lacks the latest release
// (lib/update-check.ts). It can't update by itself (that would need Docker
// control, i.e. root, from a web app), so it copies the command
// to run on the host.
// install: DELTA_INSTALL ("stack" = home server app, "brew" = Homebrew).
export function UpdatePill({ behindBy, install }: { behindBy: number; install?: string }) {
  const brew = install === "brew";
  const COMMAND = brew ? BREW : DELTA_SH;
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const what = `${behindBy} update${behindBy === 1 ? "" : "s"} available`;
  const className =
    "glass ml-auto flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted transition-colors hover:text-foreground";
  const dot = <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--positive)]" />;

  if (install === "stack") {
    return (
      <a href={STACK_GUIDE} target="_blank" rel="noreferrer" title={`${what}. How to update from your app panel.`} className={className}>
        {dot}
        <span>Update</span>
      </a>
    );
  }

  async function onClick() {
    setState((await copy(COMMAND)) ? "copied" : "failed");
    setTimeout(() => setState("idle"), 2400);
  }

  const label = state === "copied" ? "Copied" : state === "failed" ? COMMAND : "Update";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${what}. Click to copy "${COMMAND}", then run it ${brew ? "in a terminal" : "in your Delta folder on the host"}.`}
      aria-label={state === "idle" ? `Update: ${what}, copy the update command` : label}
      className={className}
    >
      {dot}
      <span aria-live="polite" className={state === "failed" ? "font-mono text-xs" : undefined}>
        {label}
      </span>
    </button>
  );
}
