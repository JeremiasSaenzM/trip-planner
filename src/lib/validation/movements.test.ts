import { describe, expect, it } from "vitest";

import { createMovementInput, deleteMovementInput, updateMovementInput } from "./movements";

describe("createMovementInput", () => {
  const BASE = {
    scenarioId: "11111111-1111-4111-8111-111111111111",
    sequence: 1,
    fromLocation: "Madrid",
    toLocation: "Fontvieux",
    departDate: "2027-07-04",
    arriveDate: "2027-07-04",
    mode: "plane" as const,
    informationState: "estimate" as const,
  };

  it("accepts a valid movement, with no budget line or source chosen", () => {
    expect(createMovementInput.safeParse(BASE).success).toBe(true);
  });

  it("accepts an overnight leg where arrival is the day after departure", () => {
    expect(createMovementInput.safeParse({ ...BASE, arriveDate: "2027-07-05" }).success).toBe(true);
  });

  // Mirrors movements_arrive_after_depart.
  it("rejects arriving before departing", () => {
    const result = createMovementInput.safeParse({ ...BASE, departDate: "2027-07-05", arriveDate: "2027-07-04" });
    expect(result.success).toBe(false);
  });

  it("rejects a blank from/to location", () => {
    expect(createMovementInput.safeParse({ ...BASE, fromLocation: " " }).success).toBe(false);
    expect(createMovementInput.safeParse({ ...BASE, toLocation: " " }).success).toBe(false);
  });

  it("rejects an unrecognised mode", () => {
    expect(createMovementInput.safeParse({ ...BASE, mode: "teleport" }).success).toBe(false);
  });
});

describe("updateMovementInput", () => {
  const BASE = {
    id: "11111111-1111-4111-8111-111111111111",
    sequence: 1,
    fromLocation: "Madrid",
    toLocation: "Fontvieux",
    departDate: "2027-07-04",
    arriveDate: "2027-07-04",
    mode: "plane" as const,
    informationState: "estimate" as const,
  };

  it("requires a reason", () => {
    expect(updateMovementInput.safeParse(BASE).success).toBe(false);
    expect(updateMovementInput.safeParse({ ...BASE, reason: "Flight time changed" }).success).toBe(true);
  });

  it("still enforces arrive-after-depart on an edit", () => {
    const result = updateMovementInput.safeParse({
      ...BASE,
      departDate: "2027-07-05",
      arriveDate: "2027-07-04",
      reason: "Flight time changed",
    });
    expect(result.success).toBe(false);
  });
});

describe("deleteMovementInput", () => {
  it("requires a reason", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(deleteMovementInput.safeParse({ id }).success).toBe(false);
    expect(deleteMovementInput.safeParse({ id, reason: "No longer part of the plan" }).success).toBe(true);
  });
});
