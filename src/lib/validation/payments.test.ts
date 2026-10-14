import { describe, expect, it } from "vitest";

import {
  createPaymentInput,
  deletePaymentInput,
  recordPaymentInput,
  updatePaymentDetailsInput,
  updatePaymentStatusInput,
} from "./payments";

describe("createPaymentInput", () => {
  const BASE = {
    tripId: "11111111-1111-4111-8111-111111111111",
    description: "Hotel deposit",
    currency: "USD",
    totalAmount: 200,
    refundability: "refundable" as const,
    timingType: "due_on_date" as const,
    competitionRelated: false,
  };

  it("accepts a category, with no budget line chosen", () => {
    const result = createPaymentInput.safeParse({ ...BASE, category: "C" });
    expect(result.success).toBe(true);
  });

  it("accepts an existing budget line, with no category", () => {
    const result = createPaymentInput.safeParse({
      ...BASE,
      budgetLineId: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.success).toBe(true);
  });

  it("rejects neither a category nor a budget line", () => {
    const result = createPaymentInput.safeParse(BASE);
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative total amount", () => {
    expect(createPaymentInput.safeParse({ ...BASE, category: "C", totalAmount: 0 }).success).toBe(false);
  });
});

describe("deletePaymentInput", () => {
  it("requires a reason", () => {
    const paymentId = "11111111-1111-4111-8111-111111111111";
    expect(deletePaymentInput.safeParse({ paymentId }).success).toBe(false);
    expect(deletePaymentInput.safeParse({ paymentId, reason: "No longer needed" }).success).toBe(true);
  });
});

describe("recordPaymentInput", () => {
  it("accepts a positive partial-payment amount with a reason", () => {
    const result = recordPaymentInput.safeParse({
      paymentId: "11111111-1111-4111-8111-111111111111",
      amount: 100,
      reason: "First deposit paid",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero amount and a missing reason", () => {
    expect(
      recordPaymentInput.safeParse({
        paymentId: "11111111-1111-4111-8111-111111111111",
        amount: 0,
        reason: "Something",
      }).success,
    ).toBe(false);
    expect(
      recordPaymentInput.safeParse({ paymentId: "11111111-1111-4111-8111-111111111111", amount: 100 }).success,
    ).toBe(false);
  });
});

describe("updatePaymentStatusInput", () => {
  it("accepts every status, including cancelled", () => {
    for (const status of ["planned", "committed", "paid", "cancelled"] as const) {
      const result = updatePaymentStatusInput.safeParse({
        paymentId: "11111111-1111-4111-8111-111111111111",
        status,
        reason: "Status updated",
      });
      expect(result.success).toBe(true);
    }
  });

  it("requires a reason even for a status change", () => {
    const result = updatePaymentStatusInput.safeParse({
      paymentId: "11111111-1111-4111-8111-111111111111",
      status: "paid",
    });
    expect(result.success).toBe(false);
  });
});

describe("updatePaymentDetailsInput", () => {
  const VALID = {
    paymentId: "11111111-1111-4111-8111-111111111111",
    description: "Hotel balance",
    totalAmount: 500,
    currency: "USD",
    datesState: "estimate" as const,
    timingType: "due_on_date" as const,
    informationState: "estimate" as const,
    refundability: "unknown" as const,
    competitionRelated: true,
    reason: "Hotel confirmed the final balance",
  };

  it("accepts a valid edit", () => {
    expect(updatePaymentDetailsInput.safeParse(VALID).success).toBe(true);
  });

  it("rejects confirmed information state with no source", () => {
    const result = updatePaymentDetailsInput.safeParse({ ...VALID, informationState: "confirmed" });
    expect(result.success).toBe(false);
  });

  it("rejects confirmed dates state with no dates source, independently of informationState", () => {
    const result = updatePaymentDetailsInput.safeParse({ ...VALID, datesState: "confirmed" });
    expect(result.success).toBe(false);
  });
});
