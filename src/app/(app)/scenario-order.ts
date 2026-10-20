import type { Scenario } from "@/lib/data/types";

// Neither data source promises an order for getScenarios() (Postgres
// returns rows in whatever order it likes), and the dashboard falls back
// to "the first scenario" whenever ?scenario= is missing or stale -- so
// "first" has to mean the same thing every time: the oldest one. id
// breaks ties, since two scenarios created in the same instant (or two
// fixtures with the same createdAt) would otherwise still swap places.
export function sortScenarios(scenarios: Scenario[]): Scenario[] {
  return [...scenarios].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
