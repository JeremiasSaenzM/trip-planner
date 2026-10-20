"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { dashboardQuery } from "./dashboard-query";

// Sections of the app.
const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: SuitcaseIcon },
  { href: "/budget-lines", label: "Budget", icon: ListIcon },
  { href: "/payments", label: "Payments", icon: ReceiptIcon },
  { href: "/deadlines", label: "Deadlines", icon: CalendarIcon },
  { href: "/export", label: "Export", icon: DownloadIcon },
];

// Every link carries the current ?scenario=&basis= along (see
// dashboard-query.ts). useSearchParams() makes the component that calls
// it client-rendered up to the nearest <Suspense> -- so the static shell
// prerenders the links with no query as the fallback, and NavWithQuery
// swaps in the same links with the query once the URL is known.
//
// usePathname() needs the same treatment on a dynamic route like
// /import/[batch], whose path isn't known when the shell is prerendered:
// there the fallback is the links with nothing highlighted. On every
// static route the path is known, so the prerendered tab bar still
// highlights the current section.
export function Nav({ variant }: { variant: "bottom" | "top" }) {
  return (
    <Suspense
      fallback={
        <Suspense fallback={<NavLinks variant={variant} query="" pathname={null} />}>
          <NavWithPathname variant={variant} query="" />
        </Suspense>
      }
    >
      <NavWithQuery variant={variant} />
    </Suspense>
  );
}

function NavWithQuery({ variant }: { variant: "bottom" | "top" }) {
  const searchParams = useSearchParams();
  return <NavWithPathname variant={variant} query={dashboardQuery(searchParams)} />;
}

// usePathname() highlights the current section.
function NavWithPathname({ variant, query }: { variant: "bottom" | "top"; query: string }) {
  return <NavLinks variant={variant} query={query} pathname={usePathname()} />;
}

// Mobile: fixed tab bar at the bottom, within thumb reach.
// From the md breakpoint up: the same links inline in the header.
function NavLinks({ variant, query, pathname }: { variant: "bottom" | "top"; query: string; pathname: string | null }) {

  if (variant === "top") {
    return (
      <nav aria-label="Main" className="hidden gap-1 md:flex">
        {NAV_ITEMS.map(({ href, label }) => (
          <Link
            key={href}
            href={`${href}${query}`}
            aria-current={pathname === href ? "page" : undefined}
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 aria-[current=page]:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:aria-[current=page]:text-zinc-50"
          >
            {label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/95"
    >
      <ul className="flex">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href} className="flex-1">
            <Link
              href={`${href}${query}`}
              aria-current={pathname === href ? "page" : undefined}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-zinc-500 aria-[current=page]:text-zinc-950 dark:text-zinc-400 dark:aria-[current=page]:text-zinc-50"
            >
              <Icon />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SuitcaseIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12m0 0-4-4m4 4 4-4M5 19h14" />
    </svg>
  );
}
