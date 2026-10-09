import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Trip Planner</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Log in with a one-time link sent to your email.
          </p>
        </div>

        {/* Reading searchParams is request-time data, so with Cache Components
            it streams in behind Suspense while the rest of the page is static. */}
        <Suspense>
          <CallbackError searchParams={searchParams} />
        </Suspense>

        <LoginForm />
      </div>
    </main>
  );
}

// Shown when /auth/callback sends us back with ?error=link.
async function CallbackError({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const { error } = await searchParams;
  if (error !== "link") return null;

  return (
    <p
      role="alert"
      className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
    >
      That login link didn&apos;t work. It may have expired, been used already,
      or been opened in a different browser than the one that requested it.
      Request a new one below.
    </p>
  );
}
