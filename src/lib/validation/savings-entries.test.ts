import { describe, expect, it } from "vitest";

import { recordSavingsEntryInput } from "./savings-entries";

describe("recordSavingsEntryInput", () => {
  it("accepts a valid entry, with no currency field at all", () => {
    const result = recordSavingsEntryInput.safeParse({
      tripId: "11111111-1111-4111-8111-111111111111",
      amount: 250,
      recordedOn: "2027-01-01",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("currency");
    }
  });

  it("rejects a zero or negative amount", () => {
    const base = { tripId: "11111111-1111-4111-8111-111111111111", recordedOn: "2027-01-01" };
    expect(recordSavingsEntryInput.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(recordSavingsEntryInput.safeParse({ ...base, amount: -50 }).success).toBe(false);
  });
});
