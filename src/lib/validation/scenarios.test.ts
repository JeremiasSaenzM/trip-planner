import { describe, expect, it } from "vitest";

import { clearScenarioTravelWindowInput, createScenarioInput, deleteScenarioInput, updateScenarioInput } from "./scenarios";

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const SCENARIO_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_ID = "44444444-4444-4444-8444-444444444444";

describe("createScenarioInput", () => {
  it("accepts a scenario with an event", () => {
    const result = createScenarioInput.safeParse({ tripId: TRIP_ID, name: "Thornmere 2029", eventId: EVENT_ID });
    expect(result.success).toBe(true);
  });

  it("accepts a scenario with no event yet -- it can be linked later", () => {
    const result = createScenarioInput.safeParse({ tripId: TRIP_ID, name: "Host not announced" });
    expect(result.success).toBe(true);
  });

  it("rejects a blank name", () => {
    const result = createScenarioInput.safeParse({ tripId: TRIP_ID, name: "", eventId: EVENT_ID });
    expect(result.success).toBe(false);
  });

  it("accepts an own travel window set upfront (e.g. from an import proposal)", () => {
    const result = createScenarioInput.safeParse({
      tripId: TRIP_ID,
      name: "Shorter trip",
      departureDate: "2028-07-02",
      returnDate: "2028-07-10",
    });
    expect(result.success).toBe(true);
  });

  it("rejects one date without the other", () => {
    const result = createScenarioInput.safeParse({ tripId: TRIP_ID, name: "Shorter trip", departureDate: "2028-07-02" });
    expect(result.success).toBe(false);
  });
});

describe("updateScenarioInput", () => {
  const BASE = { id: SCENARIO_ID, name: "Thornmere 2029 + Paris", travelDatesState: "pending" as const, reason: "Adding Paris" };

  it("accepts a rename that links an event", () => {
    const result = updateScenarioInput.safeParse({ ...BASE, eventId: EVENT_ID });
    expect(result.success).toBe(true);
  });

  it("accepts no event (unlinking)", () => {
    const result = updateScenarioInput.safeParse({ ...BASE, name: "Host TBA" });
    expect(result.success).toBe(true);
  });

  it("rejects a blank reason", () => {
    const result = updateScenarioInput.safeParse({ ...BASE, reason: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a blank name", () => {
    const result = updateScenarioInput.safeParse({ ...BASE, name: " " });
    expect(result.success).toBe(false);
  });

  it("accepts a scenario's own travel window override", () => {
    const result = updateScenarioInput.safeParse({
      ...BASE,
      departureDate: "2028-06-28",
      returnDate: "2028-07-10",
    });
    expect(result.success).toBe(true);
  });

  it("accepts no window at all -- inheriting the trip's", () => {
    const result = updateScenarioInput.safeParse(BASE);
    expect(result.success).toBe(true);
  });

  it("rejects one date without the other", () => {
    const result = updateScenarioInput.safeParse({ ...BASE, departureDate: "2028-06-28" });
    expect(result.success).toBe(false);
  });

  it("rejects a return date before the departure date", () => {
    const result = updateScenarioInput.safeParse({
      ...BASE,
      departureDate: "2028-07-10",
      returnDate: "2028-06-28",
    });
    expect(result.success).toBe(false);
  });

  it("rejects confirmed travel dates with no dates set", () => {
    const result = updateScenarioInput.safeParse({ ...BASE, travelDatesState: "confirmed" });
    expect(result.success).toBe(false);
  });

  it("rejects confirmed travel dates with no source", () => {
    const result = updateScenarioInput.safeParse({
      ...BASE,
      departureDate: "2028-06-28",
      returnDate: "2028-07-10",
      travelDatesState: "confirmed",
    });
    expect(result.success).toBe(false);
  });

  it("accepts confirmed travel dates with both dates and a source", () => {
    const result = updateScenarioInput.safeParse({
      ...BASE,
      departureDate: "2028-06-28",
      returnDate: "2028-07-10",
      travelDatesState: "confirmed",
      travelDatesSourceId: SOURCE_ID,
    });
    expect(result.success).toBe(true);
  });
});

describe("clearScenarioTravelWindowInput", () => {
  it("accepts just the scenario's unrelated fields and a reason -- no date fields at all", () => {
    const result = clearScenarioTravelWindowInput.safeParse({
      id: SCENARIO_ID,
      name: "Thornmere 2029",
      eventId: EVENT_ID,
      reason: "Back to the trip's own window",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank reason", () => {
    const result = clearScenarioTravelWindowInput.safeParse({ id: SCENARIO_ID, name: "Thornmere 2029", reason: "" });
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
