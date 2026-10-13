import { describe, expect, it } from "vitest";
import { calculateEffectiveFlightCost } from "./calculate-effective-flight-cost";

describe("calculateEffectiveFlightCost", () => {
  it("ignores bagFee when baggage is included", () => {
    const result = calculateEffectiveFlightCost({
      fare: 400,
      bagFee: 60,
      mandatoryFees: 35,
      currency: "EUR",
      baggage: "included",
    });
    expect(result.amount).toBe(435);
    expect(result.complete).toBe(true);
  });

  it("adds bagFee when baggage is a paid add-on", () => {
    const result = calculateEffectiveFlightCost({
      fare: 400,
      bagFee: 60,
      mandatoryFees: 35,
      currency: "EUR",
      baggage: "paid_addon",
    });
    expect(result.amount).toBe(495);
    expect(result.complete).toBe(true);
  });

  it("ignores bagFee when baggage is not allowed, but the cost is still complete", () => {
    const result = calculateEffectiveFlightCost({
      fare: 300,
      bagFee: 0,
      mandatoryFees: 25,
      currency: "EUR",
      baggage: "not_allowed",
    });
    expect(result.amount).toBe(325);
    expect(result.complete).toBe(true);
  });

  it("marks the result incomplete when baggage allowance is unknown, while still returning a best-effort amount", () => {
    const result = calculateEffectiveFlightCost({
      fare: 400,
      bagFee: 60,
      mandatoryFees: 35,
      currency: "EUR",
      baggage: "unknown",
    });
    expect(result.amount).toBe(435);
    expect(result.complete).toBe(false);
  });
});
