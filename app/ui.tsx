import Link from "next/link";
import { AskAgent } from "./ask-agent";

// Shared layout primitives for the server pages. Styling lives in the
// `.surface` / `.glass` / `.btn` / `.field` classes in globals.css.

export function Page({
  title,
  subtitle,
  actions,
  wide,
  ask = true,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  wide?: boolean;
  ask?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main
      className={`mx-auto flex w-full flex-col gap-5 px-4 pb-16 pt-4 sm:gap-6 sm:px-6 sm:pt-8 ${
        wide ? "max-w-6xl" : "max-w-4xl"
      }`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions || ask ? (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {ask ? <AskAgent scope="page" /> : null}
          </div>
        ) : null}
      </div>
      {children}
    </main>
  );
}

// Titled cards get an "Ask" button that copies the card for the agent; pass
// ask={false} on cards that are forms rather than data.
export function Card({
  title,
  action,
  ask = true,
  className = "",
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  ask?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`surface flex min-w-0 flex-col gap-4 p-4 sm:p-5 ${className}`}>
      {title || action ? (
        <div data-ask-skip="" className="flex items-center justify-between gap-3">
          {title ? <h2 className="text-sm font-semibold">{title}</h2> : <span />}
          <div className="flex min-w-0 items-center gap-1">
            {action}
            {title && ask ? <AskAgent /> : null}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  size = "md",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <span
        className={`font-semibold tracking-tight tabular-nums ${
          size === "lg" ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl"
        }`}
      >
        {value}
      </span>
      {sub ? <span className="text-xs text-muted">{sub}</span> : null}
    </div>
  );
}

// "▲ 12% vs last month" — direction is shown by arrow + words, never color
// alone. `goodWhenUp` decides whether an increase gets the positive tone.
export function Change({
  current,
  previous,
  suffix,
  goodWhenUp,
}: {
  current: number;
  previous: number;
  suffix: string;
  goodWhenUp: boolean;
}) {
  if (previous === 0) return <span className="text-muted">No prior data {suffix}</span>;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.5) return <span className="text-muted">Flat {suffix}</span>;
  const up = pct > 0;
  const good = up === goodWhenUp;
  return (
    <span className={good ? "text-positive" : "text-negative"}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%{" "}
      <span className="text-muted">{suffix}</span>
    </span>
  );
}

export function Empty({
  children,
  href,
  cta,
}: {
  children: React.ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-2 text-sm text-muted">
      <p>{children}</p>
      {href && cta ? (
        <Link href={href} className="btn btn-sm">
          {cta}
        </Link>
      ) : null}
    </div>
  );
}

// Horizontal magnitude bar. Ink by default; `tone` for status, `color` for a
// category's identity color (always shown next to its text label).
export function Meter({
  value,
  max,
  label,
  tone = "ink",
  color,
}: {
  value: number;
  max: number;
  label: string;
  tone?: "ink" | "positive" | "warning" | "negative";
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill =
    tone === "negative"
      ? "bg-negative"
      : tone === "warning"
        ? "bg-warning"
        : tone === "positive"
          ? "bg-positive"
          : "bg-ink";
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-fill-strong"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${color ? "" : fill}`}
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

// Letter avatar on a soft wash of an identity color (text stays in ink).
export function Tint({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase"
      style={{ background: `color-mix(in oklab, ${color} 24%, transparent)` }}
    >
      {children}
    </span>
  );
}

// Small category marker: a tinted circle with the category's identity color.
export function Dot({ color, className = "h-2.5 w-2.5" }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{ background: color }}
    />
  );
}

export function Pager({
  page,
  totalPages,
  total,
  noun,
  href,
}: {
  page: number;
  totalPages: number;
  total: number;
  noun: string;
  href: (p: number) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">
        Page {page} of {totalPages} · {total.toLocaleString()} {noun}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="btn btn-sm">
            ← Prev
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link href={href(page + 1)} className="btn btn-sm">
            Next →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
