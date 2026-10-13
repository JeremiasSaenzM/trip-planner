import { assertDemoModeIsSafe } from "@/lib/demo-mode";

// Next.js calls this once when the server starts, before handling any
// request: https://nextjs.org/docs/app/guides/instrumentation. A
// DEMO_MODE variable wrongly scoped to Production fails here, at boot,
// rather than on a real visitor's request.
export function register() {
  assertDemoModeIsSafe();
}
