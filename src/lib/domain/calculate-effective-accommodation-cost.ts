import type { AccommodationRateUnit } from "./types";

export type EffectiveAccommodationCostInput = {
  rateAmount: number;
  rateUnit: AccommodationRateUnit;
  nights: number;
  mandatoryFees: number;
  currency: string;
  conditionalRate: boolean;
  undiscountedAmount: number | null;
};

export type EffectiveAccommodationCostResult = {
  amount: number;
  /** Only set when conditionalRate -- the same formula run against
   * undiscountedAmount instead of rateAmount, so a caller never has to
   * invoke this function twice to get the figure the spec says should
   * drive a conservative-basis decision by hand (Au Royal Mad: USD 836
   * conditional vs USD 1,131 undiscounted). */
  undiscountedAmount: number | null;
  currency: string;
};

/** Rate x nights + mandatory fees, in the quoted currency -- computed,
 * never stored. Mirrors calculateEffectiveFlightCost's shape and naming
 * on purpose: same kind of number, same reason it's never auto-written
 * to a budget line. */
export function calculateEffectiveAccommodationCost(
  input: EffectiveAccommodationCostInput,
): EffectiveAccommodationCostResult {
  const multiplier = input.rateUnit === "per_night" ? input.nights : 1;
  const amount = input.rateAmount * multiplier + input.mandatoryFees;
  const undiscountedAmount =
    input.conditionalRate && input.undiscountedAmount !== null
      ? input.undiscountedAmount * multiplier + input.mandatoryFees
      : null;

  return { amount, undiscountedAmount, currency: input.currency };
}
