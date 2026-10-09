"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sections of the app. Phase 3 adds Budget, Payments, Deadlines, etc.
const NAV_ITEMS = [{ href: "/", label: "Trips", icon: SuitcaseIcon }];

// Client Component because it needs usePathname() to highlight the current section.
// Mobile: fixed tab bar at the bottom, within thumb reach.
// From the md breakpoint up: the same links inline in the header.
export function Nav({ variant }: { variant: "bottom" | "top" }) {
  const pathname = usePathname();

  if (variant === "top") {
    return (
      <nav aria-label="Main" className="hidden gap-1 md:flex">
        {NAV_ITEMS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
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
              href={href}
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
