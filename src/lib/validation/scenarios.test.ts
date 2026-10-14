import { describe, expect, it } from "vitest";

import { createScenarioInput } from "./scenarios";

describe("createScenarioInput", () => {
  it("accepts a scenario with a competition", () => {
    const result = createScenarioInput.safeParse({
      tripId: "11111111-1111-4111-8111-111111111111",
      name: "Llangollen 2027",
      competitionId: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing competitionId -- a competition-less scenario can't satisfy the payment acceptance safeguard", () => {
    const result = createScenarioInput.safeParse({
      tripId: "11111111-1111-4111-8111-111111111111",
      name: "Llangollen 2027",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a blank name", () => {
    const result = createScenarioInput.safeParse({
      tripId: "11111111-1111-4111-8111-111111111111",
      name: "",
      competitionId: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.success).toBe(false);
  });
});
