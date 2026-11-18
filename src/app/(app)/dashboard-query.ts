import { BASES, type Basis } from "@/lib/domain/types";

import { DEFAULT_SAVINGS_VIEW, type SavingsView } from "./savings-view";

// The dashboard's view state lives in the URL (?trip=&scenario=&basis=&savings=,
// see dashboard-controls.tsx), so any link between pages has to carry it
// along -- otherwise every nav click quietly drops back to the first
// trip or scenario. Only these keys are carried: anything else on the
// current URL belongs to that one page.
//
// This list is a trap if it's forgotten: add a parameter to
// DashboardControls without adding it here, and that selection will
// silently stop surviving navigation -- nothing fails, it just quietly
// resets on the next click. Every parameter DashboardControls emits
// must be listed here.
//
// "savings" (savings-view.ts, which pair of savings charts is shown) is
// the first key added since this warning was written.
const CARRIED_KEYS = ["trip", "scenario", "basis", "savings"] as const;

export function dashboardQuery(searchParams: { get(key: string): string | null }): string {
  const carried = new URLSearchParams();
  for (const key of CARRIED_KEYS) {
    const value = searchParams.get(key);
    if (value) carried.set(key, value);
  }
  const query = carried.toString();
  return query === "" ? "" : `?${query}`;
}

/** ?basis= as a Basis. Anything else, or nothing, is Target -- the
 * planning reference, and the default everywhere. */
export function parseBasis(value: unknown): Basis {
  return typeof value === "string" && (BASES as readonly string[]).includes(value) ? (value as Basis) : "target";
}

/**
 * A link to a dashboard page carrying the selection: the one place a
 * control builds one, so a new carried key is added here once rather
 * than to every hand-written query string. ?savings= is left off when
 * it's the default, so ordinary links stay short.
 */
export function dashboardHref(
  basePath: string,
  selection: { trip?: string; scenario?: string; basis?: Basis; savings?: SavingsView },
): string {
  const query = new URLSearchParams();
  if (selection.trip) query.set("trip", selection.trip);
  if (selection.scenario) query.set("scenario", selection.scenario);
  if (selection.basis) query.set("basis", selection.basis);
  if (selection.savings && selection.savings !== DEFAULT_SAVINGS_VIEW) query.set("savings", selection.savings);
  const text = query.toString();
  return text === "" ? basePath : `${basePath}?${text}`;
}
