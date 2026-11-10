import { DateTime } from "luxon";

export type ObservationCoverageInput = {
  option: { observedStartDate: string | null; nights: number };
  stay: { startDate: string; nights: number };
};

export type ObservationCoverageResult =
  | { status: "ok"; yearShifted: boolean }
  | { status: "undated" }
  | { status: "night_count_differs"; optionNights: number; stayNights: number }
  | {
      status: "dates_differ";
      observedRange: { start: string; end: string };
      stayRange: { start: string; end: string };
      yearShifted: boolean;
    };

function toDate(value: string): DateTime {
  return DateTime.fromISO(value, { zone: "utc" });
}

/**
 * A rate observed for one window must agree with the stay it's meant
 * to cover -- an unfounded figure is a defect, not an uncertainty
 * (Phase 6.11). Compares month-and-day only, never the year: A-009
 * deliberately carries a whole year's observations forward as next
 * year's placeholders, and that sanctioned shift must never be
 * flagged, only a genuine day/month slip (the actual defect this
 * check exists to catch).
 *
 * "undated" (no observedStartDate at all) is not an error -- a guide
 * price with no specific dates is still legitimate, just no evidence
 * for any particular night.
 */
export function checkObservationCoversStay(input: ObservationCoverageInput): ObservationCoverageResult {
  if (input.option.observedStartDate === null) {
    return { status: "undated" };
  }

  if (input.option.nights !== input.stay.nights) {
    return {
      status: "night_count_differs",
      optionNights: input.option.nights,
      stayNights: input.stay.nights,
    };
  }

  const observedStart = toDate(input.option.observedStartDate);
  const stayStart = toDate(input.stay.startDate);
  const yearShifted = observedStart.year !== stayStart.year;
  const dayMatches = observedStart.month === stayStart.month && observedStart.day === stayStart.day;

  if (dayMatches) {
    return { status: "ok", yearShifted };
  }

  const observedEnd = observedStart.plus({ days: input.option.nights });
  const stayEnd = stayStart.plus({ days: input.stay.nights });
  return {
    status: "dates_differ",
    observedRange: { start: observedStart.toISODate() as string, end: observedEnd.toISODate() as string },
    stayRange: { start: stayStart.toISODate() as string, end: stayEnd.toISODate() as string },
    yearShifted,
  };
}

/** One readable sentence for a non-"ok"/"undated" result -- the only
 * place this wording lives, shared by the Server Action, the
 * import-path rejection, and Scenario Overview. */
export function describeObservationMismatch(result: ObservationCoverageResult): string {
  switch (result.status) {
    case "night_count_differs":
      return (
        `This rate was observed for ${result.optionNights} night(s), but the stay is ` +
        `${result.stayNights} night(s) -- an accommodation figure must be backed by the nights it funds.`
      );
    case "dates_differ":
      return (
        `This rate was observed for ${result.observedRange.start} to ${result.observedRange.end}, but the stay ` +
        `runs ${result.stayRange.start} to ${result.stayRange.end} -- an accommodation figure must be backed ` +
        "by the nights it funds."
      );
    default:
      return "";
  }
}
