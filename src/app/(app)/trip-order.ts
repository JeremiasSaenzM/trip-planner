import type { Trip } from "@/lib/data/types";

// Neither data source promises an order for getTrips(): real.ts's bare
// `select *` leaves it to Postgres, and demo.ts just returns the fixture
// array as written -- a SQL `order by` would only fix the first of
// those, so a client-side sort is the one fix that reaches both the
// same way (this mirrors sortScenarios() in scenario-order.ts, which
// solves the identical problem for getScenarios()).
//
// The dashboard falls back to "the first trip" whenever ?trip= is
// missing or stale, so "first" has to mean the same thing every time:
// whichever trip you're most committed to -- the one with the earliest
// departure date, if any trip has one set, with an undated trip sorting
// after every dated one -- then the oldest trip, then id breaks any
// remaining tie.
export function sortTrips(trips: Trip[]): Trip[] {
  return [...trips].sort((a, b) => {
    if (a.departureDate !== b.departureDate) {
      if (a.departureDate === null) return 1;
      if (b.departureDate === null) return -1;
      return a.departureDate.localeCompare(b.departureDate);
    }
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}
