import { DateTime } from "luxon";

import type { HardConstraintResult } from "./types";

// A deadline this close is no longer realistically actionable notice,
// but it also hasn't passed -- still a pass, with the imminence named
// as a reason rather than folded into "fail". "Passed" and "imminent"
// are different facts; a check that reports them identically teaches
// the reader to stop trusting it once the deadline is still open.
export const CANCELLATION_DEADLINE_WARNING_DAYS = 3;

export type CancellationDeadlineInput = {
  cancellationDeadline: string | null;
  asOfDate: string;
};

function toDate(value: string): DateTime {
  return DateTime.fromISO(value, { zone: "utc" });
}

/**
 * Check 4: a refundable room stops being refundable silently once its
 * deadline passes -- this says so plainly. "unknown" when no deadline
 * is recorded at all; "fail" only once the deadline has actually
 * passed, never for one that's merely close.
 */
export function checkAccommodationCancellationDeadline(input: CancellationDeadlineInput): HardConstraintResult {
  if (input.cancellationDeadline === null) {
    return { status: "unknown", reasons: ["no cancellation deadline recorded"] };
  }

  const deadline = toDate(input.cancellationDeadline);
  const asOf = toDate(input.asOfDate);

  if (deadline < asOf) {
    return { status: "fail", reasons: [`cancellation deadline (${input.cancellationDeadline}) has passed`] };
  }

  const daysRemaining = deadline.diff(asOf, "days").days;
  if (daysRemaining <= CANCELLATION_DEADLINE_WARNING_DAYS) {
    return {
      status: "pass",
      reasons: [`cancellation deadline (${input.cancellationDeadline}) is only ${daysRemaining} day(s) away`],
    };
  }

  return { status: "pass", reasons: [`cancellation deadline (${input.cancellationDeadline}) hasn't passed`] };
}
