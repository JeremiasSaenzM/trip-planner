import { BASES, type Basis } from "@/lib/domain/types";

// The dashboard's view state lives in the URL (?scenario=&basis=, see
// dashboard-controls.tsx), so any link between pages has to carry it
// along -- otherwise every nav click quietly drops back to the first
// scenario. Only these two keys are carried: anything else on the
// current URL belongs to that one page.
const CARRIED_KEYS = ["scenario", "basis"] as const;

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
