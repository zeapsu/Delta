"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import PlaidButtons from "./plaid-buttons";
import { KeyFacts } from "./setup/key-facts";
import { PlaidKeysForm } from "./setup/plaid-keys-form";

export type WelcomePlaid = {
  ok: boolean;
  env: string;
  source: "env" | "setup" | "none";
  problems: string[];
  clientId: string | null;
};

const noSubscribe = () => () => {};
const STEPS = ["Your name", "Plaid keys", "Connect a bank"];

// First run, one card at a time: name, Plaid keys, first bank. Linking a bank
// refreshes the page into the overview, whose Getting started list takes over.
export function Welcome({
  name: initialName,
  timeZone,
  nameSaved,
  plaid,
}: {
  name: string | null;
  timeZone: string;
  nameSaved: boolean;
  plaid: WelcomePlaid;
}) {
  const [step, setStep] = useState(!nameSaved ? 0 : !plaid.ok ? 1 : 2);
  // Move focus into the new card on every step change (not on first load).
  const card = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    card.current?.querySelector<HTMLElement>("input, h2")?.focus();
  }, [step]);
  const go = (n: number) => {
    moved.current = true;
    setStep(n);
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-16 pt-8 sm:pt-[12vh]">
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="eyebrow">Welcome to Delta</h1>
        <Progress step={step} />
      </div>
      <div ref={card} key={step} className="surface step-in flex flex-col gap-5 p-5 sm:p-6">
        {step === 0 ? (
          <NameStep initialName={initialName} timeZone={timeZone} onDone={() => go(1)} />
        ) : step === 1 ? (
          <KeysStep plaid={plaid} onBack={() => go(0)} onDone={() => go(2)} />
        ) : (
          <ConnectStep plaid={plaid} onBack={() => go(1)} />
        )}
      </div>
    </main>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="sr-only">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </span>
      {STEPS.map((s, i) => (
        <span
          key={s}
          aria-hidden
          className={`h-1.5 rounded-full transition-all ${
            i === step ? "w-5 bg-ink" : i < step ? "w-1.5 bg-ink" : "w-1.5 bg-fill-strong"
          }`}
        />
      ))}
    </div>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn" onClick={onClick}>
      Back
    </button>
  );
}

function NameStep({ initialName, timeZone, onDone }: { initialName: string | null; timeZone: string; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [status, setStatus] = useState<{ saving?: boolean; error?: string }>({});
  // This browser's zone, so dates match the person's clock (null while server rendering).
  const browserZone = useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ saving: true });
    fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, timeZone: browserZone ?? timeZone }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't save");
        setStatus({});
        router.refresh();
        onDone();
      })
      .catch((err) => setStatus({ error: err.message }));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {/* Reads as one sentence: the field is part of the greeting, sized to its text. */}
      <div className="flex flex-wrap items-baseline gap-x-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        <span aria-hidden>Hi,</span>
        {/* The hidden copy sizes the grid, so the underline hugs the text. */}
        <span className="inline-grid min-w-0 max-w-full">
          <span aria-hidden className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre pr-1">
            {name || "your name"}
          </span>
          <input
            className="inline-field col-start-1 row-start-1 w-full min-w-0 border-0 border-b-2 border-hairline bg-transparent p-0 font-semibold tracking-tight transition-colors placeholder:text-muted focus:border-[var(--foreground)]"
            size={1}
            name="name"
            aria-label="Your name"
            placeholder="your name"
            autoComplete="given-name"
            maxLength={40}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={status.saving} className="btn btn-primary">
          Continue
        </button>
        <span className="hidden text-xs text-muted sm:inline">or press Enter</span>
        {status.error ? (
          <p role="status" className="text-sm text-negative">
            {status.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function KeysStep({ plaid, onBack, onDone }: { plaid: WelcomePlaid; onBack: () => void; onDone: () => void }) {
  const [replacing, setReplacing] = useState(false);
  const title = (
    <h2 tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">
      Add your Plaid keys
    </h2>
  );

  // Keys from .env: nothing to paste here.
  if (plaid.source === "env") {
    return (
      <>
        {title}
        <KeyFacts env={plaid.env} clientId={plaid.clientId} source=".env" />
        {plaid.ok ? null : <Problems problems={[...plaid.problems, "Fix .env and restart Delta."]} />}
        <div className="flex flex-wrap gap-2">
          <Back onClick={onBack} />
          {plaid.ok ? (
            <button type="button" className="btn btn-primary" onClick={onDone}>
              Continue
            </button>
          ) : null}
        </div>
      </>
    );
  }

  // Saved and accepted: keep them, or paste new ones.
  if (plaid.ok && !replacing) {
    return (
      <>
        {title}
        <KeyFacts env={plaid.env} clientId={plaid.clientId} source="Saved" />
        <div className="flex flex-wrap gap-2">
          <Back onClick={onBack} />
          <button type="button" className="btn" onClick={() => setReplacing(true)}>
            Change keys
          </button>
          <button type="button" className="btn btn-primary" onClick={onDone}>
            Continue
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {title}
        <p className="text-sm text-muted">Plaid connects Delta to your bank. Free for personal use, up to 10 banks.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-sm" href="https://dashboard.plaid.com/signup" target="_blank" rel="noreferrer">
          Sign up <span aria-hidden>↗</span>
        </a>
        <a className="btn btn-sm" href="https://dashboard.plaid.com/developers/keys" target="_blank" rel="noreferrer">
          Open Keys page <span aria-hidden>↗</span>
        </a>
      </div>
      {plaid.source === "setup" && !plaid.ok ? <Problems problems={plaid.problems} /> : null}
      <PlaidKeysForm
        initialEnv={plaid.env === "production" ? "production" : "sandbox"}
        submitLabel="Continue"
        onSaved={onDone}
        before={<Back onClick={onBack} />}
      />
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
        </svg>
        Checked with Plaid, stored only on this machine.
      </p>
    </>
  );
}

function ConnectStep({ plaid, onBack }: { plaid: WelcomePlaid; onBack: () => void }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">
          Connect a bank
        </h2>
        <p className="text-sm text-muted">Or a card or brokerage. Add more later.</p>
      </div>
      {plaid.env !== "production" ? (
        <p className="text-xs text-muted">
          Sandbox login: <span className="font-mono">user_good</span> / <span className="font-mono">pass_good</span>
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-2">
        <Back onClick={onBack} />
        <PlaidButtons connectOnly />
      </div>
    </>
  );
}

function Problems({ problems }: { problems: string[] }) {
  return (
    <ul className="text-sm text-negative">
      {problems.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}
