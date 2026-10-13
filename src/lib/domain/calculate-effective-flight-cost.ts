import type { FlightBaggage } from "./types";

export type EffectiveFlightCostInput = {
  fare: number;
  bagFee: number;
  mandatoryFees: number;
  currency: string;
  baggage: FlightBaggage;
};

export type EffectiveFlightCostResult = {
  amount: number;
  currency: string;
  /** false when baggage allowance is unknown -- the amount is still a best-effort figure, but not to be trusted as final. */
  complete: boolean;
};

/** Effective Flight Cost = fare + required baggage + mandatory fees. */
export function calculateEffectiveFlightCost(input: EffectiveFlightCostInput): EffectiveFlightCostResult {
  const baggageFeeApplied = input.baggage === "paid_addon" ? input.bagFee : 0;
  return {
    amount: input.fare + baggageFeeApplied + input.mandatoryFees,
    currency: input.currency,
    complete: input.baggage !== "unknown",
  };
}
