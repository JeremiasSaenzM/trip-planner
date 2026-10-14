import { describe, expect, it } from "vitest";

import { createFxRateInput, updateFxRateInput } from "./fx-rates";

const VALID = {
  currency: "GBP",
  rateToUsd: 1.27,
  rateDate: "2027-01-01",
  rateKind: "planning_base" as const,
  informationState: "estimate" as const,
  sourceId: "11111111-1111-4111-8111-111111111111",
};

describe("createFxRateInput", () => {
  it("accepts a valid rate", () => {
    expect(createFxRateInput.safeParse(VALID).success).toBe(true);
  });

  it("requires a source even for a planning estimate, not just when confirmed", () => {
    const withoutSource = {
      currency: VALID.currency,
      rateToUsd: VALID.rateToUsd,
      rateDate: VALID.rateDate,
      rateKind: VALID.rateKind,
      informationState: VALID.informationState,
    };
    expect(createFxRateInput.safeParse(withoutSource).success).toBe(false);
  });

  it("rejects a zero or negative rate", () => {
    expect(createFxRateInput.safeParse({ ...VALID, rateToUsd: 0 }).success).toBe(false);
    expect(createFxRateInput.safeParse({ ...VALID, rateToUsd: -1.2 }).success).toBe(false);
  });
});

describe("updateFxRateInput", () => {
  it("requires a reason", () => {
    const withId = { ...VALID, id: "22222222-2222-4222-8222-222222222222" };
    expect(updateFxRateInput.safeParse(withId).success).toBe(false);
    expect(updateFxRateInput.safeParse({ ...withId, reason: "Bank rate updated" }).success).toBe(true);
  });
});
