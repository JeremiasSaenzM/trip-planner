import { describe, expect, it } from "vitest";

import { acceptPaymentRiskInput } from "./decisions";

describe("acceptPaymentRiskInput", () => {
  it("accepts a rationale, with a null competitionId allowed", () => {
    const result = acceptPaymentRiskInput.safeParse({
      paymentId: "11111111-1111-4111-8111-111111111111",
      tripId: "22222222-2222-4222-8222-222222222222",
      competitionId: null,
      rationale: "Deposit is small enough to risk before acceptance",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank rationale", () => {
    const result = acceptPaymentRiskInput.safeParse({
      paymentId: "11111111-1111-4111-8111-111111111111",
      tripId: "22222222-2222-4222-8222-222222222222",
      competitionId: null,
      rationale: "   ",
    });
    expect(result.success).toBe(false);
  });
});
