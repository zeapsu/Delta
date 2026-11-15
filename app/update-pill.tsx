"use client";

import { useEffect, useRef, useState } from "react";
import { copy } from "./ask-agent";
import { Steps, type StepState } from "./ui";

const DELTA_SH = "./delta.sh update";
const BREW = "delta backup && brew upgrade delta && brew services restart delta";
const RELEASES = "https://github.com/zeapsu/Delta/releases/tag";
const FROM_APP = "https://zeapsu.github.io/Delta/docs/updating#update-from-the-app";
// Home server app (stack) installs update from their app panel, not a shell.
const STACK_GUIDE = "https://zeapsu.github.io/Delta/docs/home-server#update";
const STACK_FROM_APP = "https://zeapsu.github.io/Delta/docs/home-server#update";

type Run = { active: 0 | 1 | 2; outcome: "running" | "done" | "current" | "failed"; message?: string };

const link = "text-muted underline underline-offset-2 hover:text-foreground";

function CopyRow({ command }: { command: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function onClick() {
    setState((await copy(command)) ? "copied" : "failed");
    setTimeout(() => setState("idle"), 2400);
  }
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-fill p-2 pl-3">
      <code className="min-w-0 flex-1 font-mono text-xs [overflow-wrap:anywhere]">{command}</code>
      <button type="button" onClick={onClick} className="btn btn-sm shrink-0">
        <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Select it" : "Copy"}</span>
      </button>
    </div>
  );
}

// What to do by hand: the command for an install that updates from a shell, a
// hand-off to the panel for a home server app. "Update from the app next time"
// points at turning the updater on.
function Manual({ install }: { install?: string }) {
  if (install === "brew") return <CopyRow command={BREW} />;
  if (install === "stack") {
    return (
      <div className="flex flex-col gap-3">
        <a href={STACK_GUIDE} target="_blank" rel="noreferrer" className="btn btn-primary">
          How to update ↗
        </a>
        <a href={STACK_FROM_APP} target="_blank" rel="noreferrer" className={`${link} text-xs`}>
          Update from the app next time ↗
        </a>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <CopyRow command={DELTA_SH} />
      <a href={FROM_APP} target="_blank" rel="noreferrer" className={`${link} text-xs`}>
        Update from the app next time ↗
      </a>
    </div>
  );
}

// Subtle "Update" pill in the header when the build lacks the latest release
// (lib/update-check.ts). It opens a dialog: with the updater available
// (lib/updater.ts) the Update now button runs the update and follows it
// through GET /api/update; otherwise it hands over what to run by hand.
// install: DELTA_INSTALL ("stack" = home server app, "brew" = Homebrew).
export function UpdatePill({
  behindBy,
  version,
  install,
  canUpdate,
}: {
  behindBy: number;
  version: string;
  install?: string;
  canUpdate: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  // Whether a run in progress is this dialog's (clicked, or resumed on open):
  // only then do done/failed/current from the status mean anything. requestedAt
  // tells a state of this request from one left by an earlier update.
  const mine = useRef(false);
  const requestedAt = useRef(0);
  const startedAt = useRef(0);
  const brew = install === "brew";
  const what = `${behindBy} update${behindBy === 1 ? "" : "s"} available`;
  const limit = (brew ? 30 : 10) * 60_000;
  const steps = ["Back up", brew ? "Download and build" : "Download", "Restart"];

  // Opening mid-update (another tab, a reload) picks the progress back up.
  useEffect(() => {
    if (!open || !canUpdate || mine.current) return;
    let live = true;
    fetch("/api/update", { cache: "no-store" })
      .then((r) => r.json())
      .then((s) => {
        if (!live || (s.state !== "pulling" && s.state !== "restarting")) return;
        mine.current = true;
        requestedAt.current = s.requestedAt ?? 0;
        startedAt.current = Date.now();
        setRun({ active: s.state === "pulling" ? 1 : 2, outcome: "running" });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, canUpdate]);

  const running = run?.outcome === "running";
  useEffect(() => {
    if (!open || !running) return;
    async function poll() {
      if (Date.now() - startedAt.current > limit) {
        const hint = brew ? "Check update/brew.log in Delta's data folder." : "Check `docker compose logs updater`.";
        setRun((r) => r && { ...r, outcome: "failed", message: `Taking longer than expected. ${hint}` });
        return;
      }
      let s: { state?: string; message?: string; requestedAt?: number };
      try {
        const res = await fetch("/api/update", { cache: "no-store", signal: AbortSignal.timeout(4000) });
        if (!res.ok) return;
        s = await res.json();
      } catch {
        return; // Delta is restarting: keep asking.
      }
      if (!mine.current || (requestedAt.current && (s.requestedAt ?? 0) < requestedAt.current)) return;
      if (s.state === "pulling") setRun({ active: 1, outcome: "running" });
      else if (s.state === "restarting") setRun({ active: 2, outcome: "running" });
      else if (s.state === "done") setRun({ active: 2, outcome: "done" });
      else if (s.state === "current") setRun({ active: 1, outcome: "current", message: s.message });
      else if (s.state === "failed") setRun((r) => r && { ...r, outcome: "failed", message: s.message ?? "The update failed." });
    }
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [open, running, limit, brew]);

  useEffect(() => {
    if (run?.outcome !== "done") return;
    const id = setTimeout(() => location.reload(), 1500);
    return () => clearTimeout(id);
  }, [run?.outcome]);

  async function start() {
    mine.current = true;
    requestedAt.current = Number.MAX_SAFE_INTEGER; // nothing matches until the request is made
    startedAt.current = Date.now();
    setRun({ active: 0, outcome: "running" });
    try {
      const res = await fetch("/api/update", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status !== 202) {
        setRun({ active: 0, outcome: "failed", message: body.error ?? "Couldn't start the update." });
        return;
      }
      requestedAt.current = body.requestedAt ?? Date.now();
      setRun({ active: 1, outcome: "running" });
    } catch {
      setRun({ active: 0, outcome: "failed", message: "Couldn't reach Delta." });
    }
  }

  function close() {
    dialog.current?.close();
  }

  const stepState = (i: number): StepState =>
    !run ? "todo" : run.outcome === "done" || i < run.active ? "done" : i === run.active && run.outcome === "failed" ? "error" : "todo";
  const spinner = (
    <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-hairline border-t-foreground motion-reduce:animate-none" />
  );
  const showSteps = run && run.outcome !== "current";
  const live =
    run?.outcome === "running"
      ? `${steps[run.active]}…`
      : run?.outcome === "done"
        ? "Updated. Reloading."
        : (run?.message ?? "");

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
        title={`${what}.`}
        aria-label={`Update: ${what}`}
        className="glass ml-auto flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--positive)]" />
        <span>Update</span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="update-title"
        onClose={() => {
          setOpen(false);
          // A finished run doesn't linger: reopening starts fresh.
          if (run && run.outcome !== "running") {
            mine.current = false;
            setRun(null);
          }
        }}
        onClick={(e) => e.target === dialog.current && close()}
        className="glass sheet mx-auto mt-auto mb-0 w-full max-w-none rounded-t-3xl rounded-b-none p-0 pb-[env(safe-area-inset-bottom)] text-foreground sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-sm sm:rounded-3xl sm:pb-0"
      >
        <div className="flex flex-col gap-4 p-5">
          <div tabIndex={-1} className="outline-none">
            <h2 id="update-title" className="text-base font-semibold">
              Update Delta
            </h2>
            <p className="text-sm text-muted">
              {version} ·{" "}
              <a href={`${RELEASES}/${version}`} target="_blank" rel="noreferrer" className={link}>
                What&apos;s new ↗
              </a>
            </p>
          </div>

          {showSteps && (
            <Steps
              steps={steps.map((title, i) => ({
                title,
                state: stepState(i),
                action: run.outcome === "running" && i === run.active ? spinner : undefined,
              }))}
            />
          )}

          <div role="status" aria-live="polite" className={live ? "text-sm" : "sr-only"}>
            {run?.outcome === "running" ? <span className="sr-only">{live}</span> : <span className={run?.outcome === "failed" ? "text-negative" : undefined}>{live}</span>}
          </div>

          {!canUpdate ? (
            <Manual install={install} />
          ) : !run ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={start} className="btn btn-primary flex-1">
                Update now
              </button>
              <button type="button" onClick={close} className="btn flex-1">
                Cancel
              </button>
            </div>
          ) : run.outcome === "failed" ? (
            <>
              <Manual install={install} />
              <button type="button" onClick={close} className="btn">
                Close
              </button>
            </>
          ) : run.outcome === "current" ? (
            <button type="button" onClick={close} className="btn">
              Close
            </button>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
