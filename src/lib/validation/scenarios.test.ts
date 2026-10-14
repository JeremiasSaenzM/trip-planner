import { describe, expect, it } from "vitest";

import { createScenarioInput } from "./scenarios";

describe("createScenarioInput", () => {
  it("accepts a scenario with no competition yet", () => {
    const result = createScenarioInput.safeParse({
      tripId: "11111111-1111-4111-8111-111111111111",
      name: "Llangollen 2027",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank name", () => {
    const result = createScenarioInput.safeParse({
      tripId: "11111111-1111-4111-8111-111111111111",
      name: "",
    });
    expect(result.success).toBe(false);
  });
});
