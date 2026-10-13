import type { FlightBaggage, HardConstraintResult } from "./types";

export type BaggageAllowanceResult = HardConstraintResult & { requiresAddonFee: boolean };

/** Hard constraint 4: the fare must allow one checked suitcase, ~23kg. */
export function checkBaggageAllowance(input: { baggage: FlightBaggage }): BaggageAllowanceResult {
  switch (input.baggage) {
    case "included":
      return { status: "pass", reasons: ["checked bag included in the fare"], requiresAddonFee: false };
    case "paid_addon":
      return { status: "pass", reasons: ["checked bag allowed as a paid add-on"], requiresAddonFee: true };
    case "not_allowed":
      return { status: "fail", reasons: ["fare does not allow a checked bag"], requiresAddonFee: false };
    case "unknown":
      return { status: "unknown", reasons: ["baggage allowance not recorded"], requiresAddonFee: false };
  }
}
