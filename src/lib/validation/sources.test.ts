import { describe, expect, it } from "vitest";

import { createSourceInput } from "./sources";

const VALID = { provider: "Choir festival website", tier: 2, observedOn: "2027-01-01" };

describe("createSourceInput", () => {
  it("accepts a valid source", () => {
    expect(createSourceInput.safeParse(VALID).success).toBe(true);
  });

  it("accepts an optional url and notes", () => {
    const result = createSourceInput.safeParse({ ...VALID, url: "https://example.com", notes: "Checked twice" });
    expect(result.success).toBe(true);
  });

  it("rejects a tier outside 1-6", () => {
    expect(createSourceInput.safeParse({ ...VALID, tier: 7 }).success).toBe(false);
  });

  it("rejects a malformed observation date", () => {
    expect(createSourceInput.safeParse({ ...VALID, observedOn: "01/01/2027" }).success).toBe(false);
  });
});
