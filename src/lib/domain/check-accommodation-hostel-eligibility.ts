import type { HardConstraintResult, StayKind } from "./types";

export type HostelEligibilityInput = {
  isHostel: boolean;
  stayKind: StayKind;
};

/**
 * Check 5: hostels aren't eligible during the event (planning system
 * 01 §3) -- the cheapest *eligible* option sets the minimum, so a
 * hostel candidate on the event stay fails outright rather than
 * quietly setting a floor nothing can actually book. Both inputs are
 * always recorded (isHostel defaults false, stayKind is never null), so
 * this never reports "unknown".
 */
export function checkAccommodationHostelEligibility(input: HostelEligibilityInput): HardConstraintResult {
  if (input.isHostel && input.stayKind === "event") {
    return { status: "fail", reasons: ["hostels aren't eligible during the event"] };
  }
  return { status: "pass", reasons: input.isHostel ? ["a hostel, but not for the event stay"] : ["not a hostel"] };
}
