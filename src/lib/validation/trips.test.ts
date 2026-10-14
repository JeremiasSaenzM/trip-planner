import { describe, expect, it } from "vitest";

import { createTripInput } from "./trips";

describe("createTripInput", () => {
  it("accepts a named trip", () => {
    expect(createTripInput.safeParse({ name: "Llangollen 2027" }).success).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(createTripInput.safeParse({ name: "  " }).success).toBe(false);
  });
});
