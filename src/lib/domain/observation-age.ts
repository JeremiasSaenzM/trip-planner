import { DateTime } from "luxon";

// A flight fare and a hotel rate are the same kind of fact -- a
// perishable, demand-sensitive market price -- so they share one
// threshold. Two weeks is long enough that a genuinely stable fare
// would still look fresh, short enough that a real market move is
// likely to have happened by then.
export const RATE_STALENESS_DAYS = 14;

// The generic sources list (scenario-evidence.ts's "What this is built
// on") has no context on what a given source backs -- a hotel rate, a
// published event fee, a venue policy -- so it can't reuse
// RATE_STALENESS_DAYS without guessing. Most of what lands there is
// slower-moving than a market price, so a longer default avoids crying
// wolf on a tier-1 page that hasn't changed in months.
export const SOURCE_STALENESS_DAYS = 60;

/** Whole days between observedOn and asOfDate -- both calendar dates,
 * so this is pinned to "utc" the same way format.ts's date helpers are. */
export function observationAgeDays(observedOn: string, asOfDate: string): number {
  const observed = DateTime.fromISO(observedOn, { zone: "utc" });
  const asOf = DateTime.fromISO(asOfDate, { zone: "utc" });
  return Math.round(asOf.diff(observed, "days").days);
}
