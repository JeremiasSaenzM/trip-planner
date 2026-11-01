import { DateTime } from "luxon";

import type { HardConstraintResult } from "./types";

export type DatesCoveredInput = {
  stayStartDate: string;
  stayNights: number;
  /** sources.applicable_period, already parsed by real.ts's parseDateRange.
   * null means the source doesn't state a date range at all. */
  applicablePeriod: { start: string | null; end: string | null } | null;
};

function toDate(value: string): DateTime {
  return DateTime.fromISO(value, { zone: "utc" });
}

/**
 * Check 2: the stay's own range -- [startDate, startDate + nights), the
 * same convention build-itinerary-timeline.ts already uses -- must fall
 * inside whatever range the source states it quoted. "unknown" when the
 * source doesn't state one at all (G-012: use the bound that's recorded,
 * say so when there isn't one).
 */
export function checkAccommodationDatesCovered(input: DatesCoveredInput): HardConstraintResult {
  if (!input.applicablePeriod) {
    return { status: "unknown", reasons: ["the source doesn't state a date range for this rate"] };
  }

  const stayStart = toDate(input.stayStartDate);
  const stayEnd = stayStart.plus({ days: input.stayNights });
  const { start, end } = input.applicablePeriod;

  const afterStart = start === null || stayStart >= toDate(start);
  const beforeEnd = end === null || stayEnd <= toDate(end);

  if (afterStart && beforeEnd) {
    return { status: "pass", reasons: ["the stay's dates fall inside the source's quoted range"] };
  }
  return {
    status: "fail",
    reasons: [
      `the stay runs ${input.stayStartDate} to ${stayEnd.toISODate()}, outside the source's quoted range ` +
        `(${start ?? "open"} to ${end ?? "open"})`,
    ],
  };
}
