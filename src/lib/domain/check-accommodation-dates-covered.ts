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
 *
 * Month and day only, never the year -- the same rule
 * checkObservationCoversStay applies: A-009 deliberately carries a
 * whole year's observations forward as next year's placeholders, so a
 * 2027 quote standing in for a 2028 stay is the declared convention,
 * not a failure. "Month and day only" for a *range* means: the stay is
 * covered if the quoted range, moved by some whole number of years,
 * contains it. Moving the range (rather than comparing month/day
 * numbers directly) keeps a range that crosses New Year working.
 *
 * Only the shifts -1, 0 and +1 around the stay's own year need trying:
 * the anchor bound's year is matched to the stay's start year, and a
 * range or stay crossing New Year can put the right answer one year
 * either side of that. A quoted range longer than a year already
 * contains the stay at the unshifted offset if it contains it at all.
 */
export function checkAccommodationDatesCovered(input: DatesCoveredInput): HardConstraintResult {
  if (!input.applicablePeriod) {
    return { status: "unknown", reasons: ["the source doesn't state a date range for this rate"] };
  }

  const stayStart = toDate(input.stayStartDate);
  const stayEnd = stayStart.plus({ days: input.stayNights });
  const { start, end } = input.applicablePeriod;

  // Both bounds open: the source states a range that excludes nothing.
  const anchor = start ?? end;
  if (anchor === null) {
    return { status: "pass", reasons: ["the stay's dates fall inside the source's quoted range"] };
  }

  const baseShift = stayStart.year - toDate(anchor).year;
  // Unshifted first, so a quote from the stay's own year is never
  // described as carried forward when it doesn't need to be.
  const candidates = [...new Set([0, baseShift, baseShift - 1, baseShift + 1])];

  for (const years of candidates) {
    const shiftedStart = start === null ? null : toDate(start).plus({ years });
    const shiftedEnd = end === null ? null : toDate(end).plus({ years });
    const afterStart = shiftedStart === null || stayStart >= shiftedStart;
    const beforeEnd = shiftedEnd === null || stayEnd <= shiftedEnd;
    if (!(afterStart && beforeEnd)) continue;

    if (years === 0) {
      return { status: "pass", reasons: ["the stay's dates fall inside the source's quoted range"] };
    }
    // A note on a pass, never a fail (see the observation-covers-stay
    // check): the shift is sanctioned, but the reader should still be
    // able to see that the price was observed for other-year dates.
    const quotedYear = toDate(anchor).year;
    return {
      status: "pass",
      reasons: [
        `priced on ${quotedYear} dates (${start ?? "open"} to ${end ?? "open"}), ` +
          `carried forward to ${quotedYear + years} under A-009`,
      ],
    };
  }

  return {
    status: "fail",
    reasons: [
      `the stay runs ${input.stayStartDate} to ${stayEnd.toISODate()}, outside the source's quoted range ` +
        `(${start ?? "open"} to ${end ?? "open"}), even allowing for a whole-year carry-forward under A-009`,
    ],
  };
}
