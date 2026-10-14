import { describe, expect, it } from "vitest";

import { acceptPaymentRiskInput, checkCanAcceptPaymentRisk } from "./decisions";

describe("acceptPaymentRiskInput", () => {
  it("accepts a rationale with a competition id", () => {
    const result = acceptPaymentRiskInput.safeParse({
      paymentId: "11111111-1111-4111-8111-111111111111",
      tripId: "22222222-2222-4222-8222-222222222222",
      competitionId: "33333333-3333-4333-8333-333333333333",
      rationale: "Deposit is small enough to risk before acceptance",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a null competitionId -- a decision with no competition can never satisfy the trigger", () => {
    const result = acceptPaymentRiskInput.safeParse({
      paymentId: "11111111-1111-4111-8111-111111111111",
      tripId: "22222222-2222-4222-8222-222222222222",
      competitionId: null,
      rationale: "Deposit is small enough to risk before acceptance",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a blank rationale", () => {
    const result = acceptPaymentRiskInput.safeParse({
      paymentId: "11111111-1111-4111-8111-111111111111",
      tripId: "22222222-2222-4222-8222-222222222222",
      competitionId: "33333333-3333-4333-8333-333333333333",
      rationale: "   ",
    });
    expect(result.success).toBe(false);
  });
});

describe("checkCanAcceptPaymentRisk", () => {
  it("allows the form when the scenario has a competition", () => {
    expect(checkCanAcceptPaymentRisk("33333333-3333-4333-8333-333333333333")).toEqual({ ok: true });
  });

  it("blocks the form with an explanatory message when the scenario has no competition", () => {
    const result = checkCanAcceptPaymentRisk(null);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      message:
        "This payment belongs to a scenario with no competition, so the acceptance safeguard can't be " +
        "satisfied. Link a competition to the scenario first.",
    });
  });
});
