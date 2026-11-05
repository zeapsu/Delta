"use client";

import { useState } from "react";
import { copy } from "./ask-agent";

// A small Copy button: "Copied" for a moment, or "Copy failed".
export function CopyButton({ text, label = "Copy", className = "btn btn-sm" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        setState((await copy(text)) ? "copied" : "failed");
        setTimeout(() => setState("idle"), 1800);
      }}
    >
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}</span>
    </button>
  );
}
