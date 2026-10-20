import { describe, expect, it } from "vitest";

import { createScenarioInput, deleteScenarioInput, updateScenarioInput } from "./scenarios";

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const COMPETITION_ID = "22222222-2222-4222-8222-222222222222";
const SCENARIO_ID = "33333333-3333-4333-8333-333333333333";

describe("createScenarioInput", () => {
  it("accepts a scenario with a competition", () => {
    const result = createScenarioInput.safeParse({ tripId: TRIP_ID, name: "Llangollen 2027", competitionId: COMPETITION_ID });
    expect(result.success).toBe(true);
  });

  it("accepts a scenario with no competition yet -- it can be linked later", () => {
    const result = createScenarioInput.safeParse({ tripId: TRIP_ID, name: "Host not announced" });
    expect(result.success).toBe(true);
  });

  it("rejects a blank name", () => {
    const result = createScenarioInput.safeParse({ tripId: TRIP_ID, name: "", competitionId: COMPETITION_ID });
    expect(result.success).toBe(false);
  });
});

describe("updateScenarioInput", () => {
  it("accepts a rename that links a competition", () => {
    const result = updateScenarioInput.safeParse({
      id: SCENARIO_ID,
      name: "Llangollen 2027 + Paris",
      competitionId: COMPETITION_ID,
      reason: "Adding Paris",
    });
    expect(result.success).toBe(true);
  });

  it("accepts no competition (unlinking)", () => {
    const result = updateScenarioInput.safeParse({ id: SCENARIO_ID, name: "Host TBA", reason: "Host withdrew" });
    expect(result.success).toBe(true);
  });

  it("rejects a blank reason", () => {
    const result = updateScenarioInput.safeParse({ id: SCENARIO_ID, name: "Host TBA", reason: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a blank name", () => {
    const result = updateScenarioInput.safeParse({ id: SCENARIO_ID, name: " ", reason: "Renaming" });
    expect(result.success).toBe(false);
  });
});

describe("deleteScenarioInput", () => {
  it("accepts an id and a reason", () => {
    expect(deleteScenarioInput.safeParse({ id: SCENARIO_ID, reason: "No longer considered" }).success).toBe(true);
  });

  it("rejects a blank reason", () => {
    expect(deleteScenarioInput.safeParse({ id: SCENARIO_ID, reason: "" }).success).toBe(false);
  });
});
