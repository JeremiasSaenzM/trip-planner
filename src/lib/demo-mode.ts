// DEMO_MODE is a server-only env var (never NEXT_PUBLIC_), set on Vercel
// scoped to Preview deployments only -- see CLAUDE.md's "Demo mode" rule.
// It carries no secret, so this file deliberately skips the usual
// `import "server-only"` guard: that package only resolves inside
// Next.js's own bundler, and this module needs to run under Vitest too.
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

// Called once at server startup, from src/instrumentation.ts. If DEMO_MODE
// ever ends up scoped to Production (a Vercel misconfiguration, or a
// later change to the scoping), the server must refuse to start rather
// than silently serve fake fixture data to a real visitor.
export function assertDemoModeIsSafe(): void {
  if (isDemoMode() && process.env.VERCEL_ENV === "production") {
    throw new Error(
      "DEMO_MODE is set but VERCEL_ENV is 'production'. DEMO_MODE must only ever be scoped to Preview deployments.",
    );
  }
}

// Every write function the data-access layer gains in Phase 5 (recording
// savings, marking a payment paid, editing a budget line, ...) must call
// this as its first line, so a form submitted while DEMO_MODE is on
// throws instead of writing fixture-derived data into a real trip.
export function assertWritesAllowed(): void {
  if (isDemoMode()) {
    throw new Error("Writes are disabled in demo mode.");
  }
}
