"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/spending", label: "Spending" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budgets", label: "Budgets" },
  { href: "/recurring", label: "Recurring" },
  { href: "/net-worth", label: "Net worth" },
  { href: "/investments", label: "Investments" },
  { href: "/settings", label: "Settings" },
];

// Floating glass tab bar. The header itself is a "scroll edge" fade so content
// passing beneath the pill stays out of the way of its labels.
export function Nav({ extra }: { extra?: React.ReactNode }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // Refraction (app/refraction.tsx) only renders correctly in Chromium;
  // iOS Chrome is WebKit and reports "CriOS", not "Chrome/".
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Chrome\//.test(ua) && CSS.supports("backdrop-filter", "url(#delta-refract)")) {
      document.documentElement.dataset.refraction = "";
    }
  }, []);

  // On narrow screens the pill scrolls; keep the current tab in view.
  useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  // Logged out: nothing to navigate to yet.
  if (pathname === "/login") return null;
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-linear-to-b from-background via-background/70 to-transparent px-2 sm:px-4">
      <Link
        href="/"
        aria-label="Delta home"
        className="glass hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-semibold sm:flex"
      >
        Δ
      </Link>
      <nav
        ref={navRef}
        aria-label="Primary"
        className="glass glass-refract flex h-10 min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap rounded-full px-1 text-sm [scrollbar-width:none]"
      >
        {LINKS.map((l) => {
          const active = isActive(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
                active
                  ? "bg-ink text-ink-foreground shadow-sm"
                  : "text-muted hover:bg-fill hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      {extra}
    </header>
  );
}
