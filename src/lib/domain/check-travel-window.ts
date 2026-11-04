export type CheckTravelWindowInput = {
  /** YYYY-MM-DD, the trip's own dates. Either can be null (not set yet). */
  departureDate: string | null;
  returnDate: string | null;
  /** YYYY-MM-DD, the event's first and final official days. */
  eventStartDate: string | null;
  eventEndDate: string | null;
};

export type TravelWindowIssue = "leaves_too_late" | "returns_too_early";

/**
 * A plain-dates sanity check of the trip's travel window against the
 * event period (hard constraint 2: be there before the first official
 * day begins, and leave only after the final one ends). Leaving home on
 * the first event day can't put you there before it begins, and
 * coming home on the final day means leaving before it ends -- so both
 * have to be strictly outside the event.
 *
 * Deliberately coarse: it compares calendar dates only. Whether a given
 * flight actually lands in time, in the event's own time zone, is
 * checkEventPresence()'s job once flights are recorded. A
 * missing date on either side means there's nothing to compare -- never
 * an issue.
 */
export function checkTravelWindow(input: CheckTravelWindowInput): TravelWindowIssue[] {
  const issues: TravelWindowIssue[] = [];
  if (input.departureDate !== null && input.eventStartDate !== null && input.departureDate >= input.eventStartDate) {
    issues.push("leaves_too_late");
  }
  if (input.returnDate !== null && input.eventEndDate !== null && input.returnDate <= input.eventEndDate) {
    issues.push("returns_too_early");
  }
  return issues;
}
