import { countNightsInBeds, type TimelineMovement } from "./build-itinerary-timeline";

export type CheckStayNightsMatchWindowInput = {
  stays: { nights: number }[];
  movements: TimelineMovement[];
  /** The resolved travel window's dates (resolveTravelWindow()) -- the
   * trip's own, or a scenario's override. */
  departureDate: string | null;
  returnDate: string | null;
};

export type StayNightsCheckResult =
  | { status: "unknown" }
  | { status: "ok" }
  | { status: "mismatch"; staysNights: number; windowNights: number };

/**
 * Catches a budget priced for a different trip length than what's
 * actually scheduled -- a 21-night budget priced against an 11-night
 * air fare, say. Sums every stay's own nights and compares the total
 * to countNightsInBeds() -- the resolved travel window, less any night
 * a movement crosses overnight -- so this agrees with
 * checkNightsAccountedFor about which nights actually need a bed.
 */
export function checkStayNightsMatchWindow(input: CheckStayNightsMatchWindowInput): StayNightsCheckResult {
  const beds = countNightsInBeds({
    movements: input.movements,
    departureDate: input.departureDate,
    returnDate: input.returnDate,
  });
  if (beds.status === "unknown") return { status: "unknown" };

  const staysNights = input.stays.reduce((total, stay) => total + stay.nights, 0);

  if (staysNights === beds.nights) {
    return { status: "ok" };
  }
  return { status: "mismatch", staysNights, windowNights: beds.nights };
}
