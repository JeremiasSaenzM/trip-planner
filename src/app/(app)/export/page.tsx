import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Export my data" };

export default function ExportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Export my data</h1>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}>
        <ExportScreen />
      </Suspense>
    </div>
  );
}

// The free Supabase plan has no automatic backups (see CLAUDE.md's
// privacy rule), so this is the only backup until importing is built
// (Phase 7 backlog) -- a plain <a> to the download route, no client JS
// needed, since the browser already knows how to save a response with
// a Content-Disposition: attachment header.
async function ExportScreen() {
  await getCurrentUser();

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Downloads everything in your trip as one JSON file: trips, competitions, scenarios, sources, budget
        lines, payments, savings entries, FX rates, decisions, open items, flight options and segments,
        imported research proposals (with what became of each), and the full change log.
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This is your only backup -- the free Supabase plan doesn&apos;t make its own. Importing this file back
        in isn&apos;t built yet.
      </p>
      <a
        href="/export/download"
        className="inline-block rounded-lg bg-zinc-900 px-4 py-3 text-base font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Download my data
      </a>

      <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Import research</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Paste proposed changes from a research session and approve them one by one. Nothing is written until
          you approve it.
        </p>
        <Link href="/import" className="inline-block text-sm font-medium underline">
          Import research
        </Link>
      </div>
    </div>
  );
}
