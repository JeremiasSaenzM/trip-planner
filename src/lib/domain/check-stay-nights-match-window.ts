import { DateTime } from "luxon";

export type CheckStayNightsMatchWindowInput = {
  stays: { nights: number }[];
  /** YYYY-MM-DD, the trip's own departure and return dates -- never
   * resolveDepartureDate()'s fallback to the competition's first day.
   * See this function's own comment for why. */
  tripDepartureDate: string | null;
  tripReturnDate: string | null;
};

export type StayNightsCheckResult =
  | { status: "unknown" }
  | { status: "ok" }
  | { status: "mismatch"; staysNights: number; windowNights: number };

/**
 * Catches a budget priced for a different trip length than what's
 * actually scheduled -- a 21-night budget priced against an 11-night
 * air fare, say. Sums every stay's own nights and compares the total
 * to the number of nights between the trip's departure and return
 * dates.
 *
 * Deliberately does not fall back to the competition's first/final day
 * the way resolveDepartureDate() does for the savings plan. That
 * fallback exists because the savings plan must always produce a
 * number, even from an unconfirmed guess -- a missing travel window
 * can't leave the required saving undefined. This is a consistency
 * check, under no such obligation: a warning derived from an invented
 * date would be a false warning, so it reports "unknown" instead of
 * guessing once the trip's own dates aren't both set.
 */
export function checkStayNightsMatchWindow(input: CheckStayNightsMatchWindowInput): StayNightsCheckResult {
  if (input.tripDepartureDate === null || input.tripReturnDate === null) {
    return { status: "unknown" };
  }

  const departure = DateTime.fromISO(input.tripDepartureDate, { zone: "utc" });
  const returnDate = DateTime.fromISO(input.tripReturnDate, { zone: "utc" });
  const windowNights = returnDate.diff(departure, "days").days;

  const staysNights = input.stays.reduce((total, stay) => total + stay.nights, 0);

  if (staysNights === windowNights) {
    return { status: "ok" };
  }
  return { status: "mismatch", staysNights, windowNights };
}
