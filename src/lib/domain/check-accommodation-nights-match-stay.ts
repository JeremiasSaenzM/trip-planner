import type { HardConstraintResult } from "./types";

export type NightsMatchStayInput = {
  optionNights: number;
  stayNights: number;
};

/**
 * Check 1: a thirteen-night quote against a twelve-night stay is the
 * Scenario-P-shaped defect this project keeps finding. Both sides are
 * always recorded (neither field is nullable), so this never reports
 * "unknown".
 */
export function checkAccommodationNightsMatchStay(input: NightsMatchStayInput): HardConstraintResult {
  if (input.optionNights === input.stayNights) {
    return { status: "pass", reasons: [`quoted for ${input.optionNights} nights, matching the stay`] };
  }
  return {
    status: "fail",
    reasons: [`quoted for ${input.optionNights} nights, but the stay is ${input.stayNights}`],
  };
}
