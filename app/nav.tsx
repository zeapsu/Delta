"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DeltaMark } from "./delta-mark";

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

// Phone tab bar: the four daily views, the rest behind "More".
const TABS = LINKS.slice(0, 4);
const MORE = LINKS.slice(4);

const ICONS: Record<string, React.ReactNode> = {
  "/": <path d="M4 11.5 12 5l8 6.5M6.5 10v8.5h11V10" />,
  "/spending": (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 4.5V12l5.5 5" />
    </>
  ),
  "/transactions": <path d="M5 7.5h14M5 12h14M5 16.5h9" />,
  "/budgets": (
    <>
      <path d="M5 18.5h14" />
      <path d="M7.5 15v-4M12 15V6.5M16.5 15V9" />
    </>
  ),
  "/recurring": <path d="M6 9a6.5 6.5 0 0 1 11.5-2M18 5v3.5h-3.5M18 15a6.5 6.5 0 0 1-11.5 2M6 19v-3.5h3.5" />,
  "/net-worth": <path d="M4.5 17 10 11l3.5 3.5 6-7M15 7.5h4.5V12" />,
  "/investments": (
    <>
      <path d="M5 19V5M5 19h14" />
      <path d="M9 15.5v-3M13 15.5V9M17 15.5v-5" />
    </>
  ),
  "/settings": (
    <>
      <path d="M5 8h9M18 8h1M5 16h1M10 16h9" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="8" cy="16" r="2" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}

// Desktop: floating glass pill at the top. Phone: a glass tab bar at the
// bottom edge, inside the thumb's reach and clear of the home indicator.
export function Nav({ extra }: { extra?: React.ReactNode }) {
  const pathname = usePathname();
  const more = useRef<HTMLDialogElement>(null);

  // Refraction (app/refraction.tsx) only renders correctly in Chromium;
  // iOS Chrome is WebKit and reports "CriOS", not "Chrome/".
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Chrome\//.test(ua) && CSS.supports("backdrop-filter", "url(#delta-refract)")) {
      document.documentElement.dataset.refraction = "";
    }
  }, []);

  // The More sheet closes once its link has navigated.
  useEffect(() => {
    more.current?.close();
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
  const moreActive = MORE.some((l) => isActive(l.href));

  // Logged out: nothing to navigate to yet.
  if (pathname === "/login") return null;
  const tab = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-colors ${
      active ? "bg-fill-strong text-foreground" : "text-muted"
    }`;
  return (
    <>
      <header className="sticky top-0 z-20 hidden h-14 items-center gap-2 bg-linear-to-b from-background via-background/70 to-transparent px-4 sm:flex">
        <Link
          href="/"
          aria-label="Delta home"
          className="glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        >
          <DeltaMark className="h-5 w-5" />
        </Link>
        <nav
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

      {extra ? <div className="flex justify-end px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:hidden">{extra}</div> : null}

      <nav
        aria-label="Primary"
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex h-16 gap-0.5 rounded-full p-1 sm:hidden"
      >
        {TABS.map((l) => {
          const active = isActive(l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={tab(active)}>
              <Icon name={l.href} />
              <span className="truncate">{l.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => more.current?.showModal()}
          className={tab(moreActive)}
        >
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>

      <dialog
        ref={more}
        aria-label="More pages"
        onClick={(e) => e.target === more.current && more.current?.close()}
        className="glass sheet mx-auto mt-auto mb-0 w-full max-w-none rounded-t-3xl rounded-b-none p-0 pb-[env(safe-area-inset-bottom)] text-foreground sm:hidden"
      >
        <ul tabIndex={-1} className="flex flex-col p-3 outline-none">
          {MORE.map((l) => {
            const active = isActive(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-medium ${
                    active ? "bg-fill-strong" : ""
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-fill text-muted">
                    <Icon name={l.href} />
                  </span>
                  {l.label}
                  <span aria-hidden className="ml-auto text-muted">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </dialog>
    </>
  );
}
