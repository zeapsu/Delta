"use client";

import { useRef, useState } from "react";

// "Ask Agent": copies what a card (or the whole page) shows, plus where it
// came from, as a ready-to-paste prompt for whatever agent the user runs.
// Delta has no agent of its own; agents read the data via MCP or the API.

const MAX_CHARS = 6000;

// Text a card shows, minus its header (title, links, Ask button — marked
// data-ask-skip) and chart internals (axis ticks read as noise; the agent can
// query the series itself). Hiding them for the synchronous innerText read
// never paints.
function visibleText(el: HTMLElement): string {
  const hidden = Array.from(
    el.querySelectorAll<HTMLElement>("[data-ask-skip], .recharts-wrapper"),
  );
  const prev = hidden.map((h) => h.style.display);
  hidden.forEach((h) => (h.style.display = "none"));
  const text = el.innerText.trim().replace(/\n{3,}/g, "\n\n");
  hidden.forEach((h, i) => (h.style.display = prev[i]));
  return text;
}

function cardText(card: HTMLElement): string {
  const title = card.querySelector("h2")?.textContent?.trim();
  const body = visibleText(card);
  return title ? `## ${title}\n${body}` : body;
}

function buildPrompt(button: HTMLElement, scope: "card" | "page"): string {
  const main = button.closest("main");
  const pageName =
    document.querySelector('nav [aria-current="page"]')?.textContent?.trim() ||
    main?.querySelector("h1")?.textContent?.trim() ||
    document.title;
  let where = `the ${pageName} page`;
  let body = "";
  if (scope === "card") {
    const card = button.closest("section");
    const title = card?.querySelector("h2")?.textContent?.trim();
    if (title) where = `the "${title}" card on ${where}`;
    if (card) body = visibleText(card);
  } else if (main) {
    body = Array.from(main.querySelectorAll("section"))
      .map(cardText)
      .filter(Boolean)
      .join("\n\n");
  }
  if (body.length > MAX_CHARS) body = body.slice(0, MAX_CHARS) + "\n…(truncated)";
  const asOf = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return [
    `I'm looking at ${where} in Delta (${location.href}, ${asOf}). It shows:`,
    "",
    body || "(only a chart — pull the numbers from the DB)",
    "",
    "Check this against the Delta DB using the delta-finance skill before answering.",
    "",
    "My question: ",
  ].join("\n");
}

// navigator.clipboard needs a secure context, and Delta is served over plain
// http on the tailnet IP — so fall back to the legacy execCommand path.
async function copy(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {}
  ta.remove();
  return ok;
}

export function AskAgent({ scope = "card" }: { scope?: "card" | "page" }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function onClick() {
    if (!ref.current) return;
    const ok = await copy(buildPrompt(ref.current, scope));
    setState(ok ? "copied" : "failed");
    setTimeout(() => setState("idle"), 1800);
  }

  const label =
    state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : scope === "page" ? "Ask Agent" : "Ask";
  return (
    <button
      ref={ref}
      type="button"
      data-ask-skip=""
      onClick={onClick}
      title={`Copy this ${scope} as a question for your agent`}
      // The accessible name starts with the visible text, so voice control ("click Ask") works.
      aria-label={state === "idle" ? `${label}: copy this ${scope} as a question for your agent` : label}
      className={
        scope === "page"
          ? "btn btn-sm"
          : "shrink-0 rounded-full px-2 py-0.5 text-xs text-muted transition-colors hover:bg-fill hover:text-foreground"
      }
    >
      <span aria-live="polite">{label}</span>
    </button>
  );
}
