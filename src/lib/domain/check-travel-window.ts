export type CheckTravelWindowInput = {
  /** YYYY-MM-DD, the trip's own dates. Either can be null (not set yet). */
  departureDate: string | null;
  returnDate: string | null;
  /** YYYY-MM-DD, the competition's first and final official days. */
  festivalStartDate: string | null;
  festivalEndDate: string | null;
};

export type TravelWindowIssue = "leaves_too_late" | "returns_too_early";

/**
 * A plain-dates sanity check of the trip's travel window against the
 * festival period (hard constraint 2: be there before the first official
 * day begins, and leave only after the final one ends). Leaving home on
 * the first festival day can't put you there before it begins, and
 * coming home on the final day means leaving before it ends -- so both
 * have to be strictly outside the festival.
 *
 * Deliberately coarse: it compares calendar dates only. Whether a given
 * flight actually lands in time, in the competition's own time zone, is
 * checkFestivalArrivalDeparture()'s job once flights are recorded. A
 * missing date on either side means there's nothing to compare -- never
 * an issue.
 */
export function checkTravelWindow(input: CheckTravelWindowInput): TravelWindowIssue[] {
  const issues: TravelWindowIssue[] = [];
  if (input.departureDate !== null && input.festivalStartDate !== null && input.departureDate >= input.festivalStartDate) {
    issues.push("leaves_too_late");
  }
  if (input.returnDate !== null && input.festivalEndDate !== null && input.returnDate <= input.festivalEndDate) {
    issues.push("returns_too_early");
  }
  return issues;
}
