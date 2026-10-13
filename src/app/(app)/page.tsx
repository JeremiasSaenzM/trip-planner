import type { Metadata } from "next";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Trips" };

export default function TripsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">My trips</h1>
      <Suspense
        fallback={<div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}
      >
        <TripsPlaceholder />
      </Suspense>
    </div>
  );
}

// Placeholder until Phase 4. It already goes through getCurrentUser(), as
// every component showing private data will, so the page is protected
// even if the proxy were bypassed.
async function TripsPlaceholder() {
  const user = await getCurrentUser();

  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      <p>
        Logged in as <span className="break-all font-medium">{user.email}</span>.
      </p>
      <p className="mt-2">
        Trips, budget, savings and payments arrive in Phase 4.
      </p>
    </div>
  );
}
