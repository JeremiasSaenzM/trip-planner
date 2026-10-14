import { describe, expect, it } from "vitest";

import { deleteSavingsEntryInput, recordSavingsEntryInput, updateSavingsEntryInput } from "./savings-entries";

describe("recordSavingsEntryInput", () => {
  it("accepts a valid entry, with no currency field at all", () => {
    const result = recordSavingsEntryInput.safeParse({
      tripId: "11111111-1111-4111-8111-111111111111",
      amount: 250,
      recordedOn: "2020-01-01",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("currency");
    }
  });

  it("rejects a zero or negative amount", () => {
    const base = { tripId: "11111111-1111-4111-8111-111111111111", recordedOn: "2020-01-01" };
    expect(recordSavingsEntryInput.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(recordSavingsEntryInput.safeParse({ ...base, amount: -50 }).success).toBe(false);
  });

  it("rejects a date in the future", () => {
    const result = recordSavingsEntryInput.safeParse({
      tripId: "11111111-1111-4111-8111-111111111111",
      amount: 250,
      recordedOn: "2999-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = recordSavingsEntryInput.safeParse({
      tripId: "11111111-1111-4111-8111-111111111111",
      amount: 250,
      recordedOn: today,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateSavingsEntryInput", () => {
  const VALID = {
    id: "22222222-2222-4222-8222-222222222222",
    amount: 100,
    recordedOn: "2020-01-01",
    reason: "Corrected the amount",
  };

  it("accepts a valid edit", () => {
    expect(updateSavingsEntryInput.safeParse(VALID).success).toBe(true);
  });

  it("requires a reason", () => {
    const withoutReason = { id: VALID.id, amount: VALID.amount, recordedOn: VALID.recordedOn };
    expect(updateSavingsEntryInput.safeParse(withoutReason).success).toBe(false);
    expect(updateSavingsEntryInput.safeParse({ ...withoutReason, reason: "   " }).success).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    expect(updateSavingsEntryInput.safeParse({ ...VALID, amount: 0 }).success).toBe(false);
  });

  it("rejects a date in the future", () => {
    expect(updateSavingsEntryInput.safeParse({ ...VALID, recordedOn: "2999-01-01" }).success).toBe(false);
  });
});

describe("deleteSavingsEntryInput", () => {
  it("requires a reason", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    expect(deleteSavingsEntryInput.safeParse({ id }).success).toBe(false);
    expect(deleteSavingsEntryInput.safeParse({ id, reason: "No longer needed" }).success).toBe(true);
  });
});
