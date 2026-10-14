import { describe, expect, it } from "vitest";

import { createBudgetLineInput, updateBudgetLineInput } from "./budget-lines";

const VALID_CREATE = {
  tripId: "11111111-1111-4111-8111-111111111111",
  category: "C" as const,
  description: "Hotel deposit",
  amountMin: 100,
  amountTarget: 150,
  amountConservative: 200,
  currency: "USD",
  informationState: "estimate" as const,
};

describe("createBudgetLineInput", () => {
  it("accepts a valid budget line", () => {
    expect(createBudgetLineInput.safeParse(VALID_CREATE).success).toBe(true);
  });

  it("rejects amounts out of min/target/conservative order", () => {
    const result = createBudgetLineInput.safeParse({ ...VALID_CREATE, amountTarget: 50 });
    expect(result.success).toBe(false);
  });

  it("rejects a 4-letter currency", () => {
    expect(createBudgetLineInput.safeParse({ ...VALID_CREATE, currency: "USDD" }).success).toBe(false);
  });

  it("rejects confirmed with no source", () => {
    const result = createBudgetLineInput.safeParse({ ...VALID_CREATE, informationState: "confirmed" });
    expect(result.success).toBe(false);
  });

  it("accepts confirmed with a source", () => {
    const result = createBudgetLineInput.safeParse({
      ...VALID_CREATE,
      informationState: "confirmed",
      sourceId: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateBudgetLineInput", () => {
  it("requires a reason", () => {
    const withId = { ...VALID_CREATE, id: "33333333-3333-4333-8333-333333333333" };
    expect(updateBudgetLineInput.safeParse(withId).success).toBe(false);
    expect(updateBudgetLineInput.safeParse({ ...withId, reason: "   " }).success).toBe(false);
  });

  it("accepts a valid edit with a reason", () => {
    const result = updateBudgetLineInput.safeParse({
      ...VALID_CREATE,
      id: "33333333-3333-4333-8333-333333333333",
      reason: "Hotel confirmed the deposit amount",
    });
    expect(result.success).toBe(true);
  });
});
