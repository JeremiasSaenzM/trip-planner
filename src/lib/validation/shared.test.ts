import { describe, expect, it } from "vitest";

import { id } from "./shared";

describe("id", () => {
  it("accepts a fixture-style id (seed.sql and fixtures.ts use sequential, non-v4 ids)", () => {
    expect(id.safeParse("20000000-0000-0000-0000-000000000001").success).toBe(true);
  });

  it("accepts a real, freshly-generated v4 id", () => {
    expect(id.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(true);
  });

  it("rejects something that isn't the right shape at all", () => {
    expect(id.safeParse("not-an-id").success).toBe(false);
    expect(id.safeParse("20000000-0000-0000-0000-00000000001").success).toBe(false); // one digit short
  });
});
