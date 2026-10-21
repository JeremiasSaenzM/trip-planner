import Link from "next/link";
import { Suspense } from "react";

import { Nav } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

// Shell for every logged-in page. "(app)" is a route group: the parentheses keep
// it out of the URL, so (app)/page.tsx is still "/". /login sits outside the
// group and doesn't get this shell.
//
// The shell itself is static (prerendered). Only parts that read the session,
// like UserMenu, stream in behind <Suspense>, so the frame appears instantly.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-[max(1rem,env(safe-area-inset-left))]">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold tracking-tight">
              Trip Planner
            </Link>
            <Nav variant="top" />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Suspense fallback={<div className="h-9 w-20" />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>

      {/* Bottom padding keeps content clear of the mobile tab bar (3.5rem + safe area). */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1.5rem)] md:pb-10">
        {children}
      </main>

      <Nav variant="bottom" />
    </div>
  );
}
