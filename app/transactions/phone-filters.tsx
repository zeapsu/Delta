"use client";

import { useState } from "react";
import Link from "next/link";

// Phone filter bar: search stays in reach, the other filters fold behind a
// button that counts the active ones. The folded fields stay in the form
// (hidden, not unmounted), so a search keeps the filters already applied.
export function PhoneFilters({
  q,
  active,
  clearable,
  children,
}: {
  q: string;
  active: number;
  clearable: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <form method="get" className="flex flex-col gap-2 sm:hidden">
      <div className="flex gap-2">
        <input
          name="q"
          type="search"
          placeholder="Search merchants"
          defaultValue={q}
          aria-label="Search"
          className="field min-w-0 flex-1 rounded-full px-4"
        />
        <button
          type="button"
          aria-expanded={open}
          aria-controls="phone-filters"
          onClick={() => setOpen(!open)}
          className="btn shrink-0"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M4 7h16M7 12h10M10 17h4" />
          </svg>
          Filters
          {active > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[11px] text-ink-foreground">
              {active}
              <span className="sr-only"> active</span>
            </span>
          ) : null}
        </button>
      </div>
      <div id="phone-filters" className={open ? "surface flex flex-col gap-3 p-4" : "hidden"}>
        {children}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary flex-1">
            Apply
          </button>
          {clearable ? (
            <Link href="/transactions" className="btn flex-1">
              Clear
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  );
}
