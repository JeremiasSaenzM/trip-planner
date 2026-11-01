import { describe, expect, it } from "vitest";

import { calculateEffectiveAccommodationCost } from "./calculate-effective-accommodation-cost";

describe("calculateEffectiveAccommodationCost", () => {
  it("multiplies a per-night rate by nights and adds mandatory fees", () => {
    const result = calculateEffectiveAccommodationCost({
      rateAmount: 65,
      rateUnit: "per_night",
      nights: 13,
      mandatoryFees: 29,
      currency: "USD",
      conditionalRate: false,
      undiscountedAmount: null,
    });
    expect(result.amount).toBe(65 * 13 + 29);
    expect(result.undiscountedAmount).toBeNull();
  });

  it("doesn't multiply a per-stay rate by nights", () => {
    const result = calculateEffectiveAccommodationCost({
      rateAmount: 77,
      rateUnit: "per_stay",
      nights: 1,
      mandatoryFees: 0,
      currency: "USD",
      conditionalRate: false,
      undiscountedAmount: null,
    });
    expect(result.amount).toBe(77);
  });

  it("computes an undiscounted figure alongside, using the same multiplier, when the rate is conditional", () => {
    const result = calculateEffectiveAccommodationCost({
      rateAmount: 836,
      rateUnit: "per_stay",
      nights: 1,
      mandatoryFees: 0,
      currency: "USD",
      conditionalRate: true,
      undiscountedAmount: 1131,
    });
    expect(result.amount).toBe(836);
    expect(result.undiscountedAmount).toBe(1131);
  });

  it("without mandatory fees, the amount is just rate times nights", () => {
    const result = calculateEffectiveAccommodationCost({
      rateAmount: 50,
      rateUnit: "per_night",
      nights: 4,
      mandatoryFees: 0,
      currency: "USD",
      conditionalRate: false,
      undiscountedAmount: null,
    });
    expect(result.amount).toBe(200);
  });
});
