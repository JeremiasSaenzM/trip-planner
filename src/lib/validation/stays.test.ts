import { describe, expect, it } from "vitest";

import { createStayInput, deleteStayInput, updateStayInput } from "./stays";

describe("createStayInput", () => {
  const BASE = {
    scenarioId: "11111111-1111-4111-8111-111111111111",
    locationId: "22222222-2222-4222-8222-222222222222",
    startDate: "2027-07-04",
    nights: 8,
    kind: "festival" as const,
    informationState: "estimate" as const,
  };

  it("accepts a valid stay, with no budget line or source chosen", () => {
    expect(createStayInput.safeParse(BASE).success).toBe(true);
  });

  it("rejects a zero or negative nights count", () => {
    expect(createStayInput.safeParse({ ...BASE, nights: 0 }).success).toBe(false);
    expect(createStayInput.safeParse({ ...BASE, nights: -1 }).success).toBe(false);
  });

  it("rejects a malformed locationId -- a stay always references a real location row now", () => {
    expect(createStayInput.safeParse({ ...BASE, locationId: "Fontvieux" }).success).toBe(false);
  });

  it("rejects an unrecognised kind", () => {
    expect(createStayInput.safeParse({ ...BASE, kind: "vacation" }).success).toBe(false);
  });

  // stays_movements.sql's own comment explains why: the source_id
  // column exists so a later booking confirmation has somewhere to
  // go, but nothing enforces "confirmed needs a source" yet.
  it("accepts a confirmed stay with no source", () => {
    expect(createStayInput.safeParse({ ...BASE, informationState: "confirmed" }).success).toBe(true);
  });
});

describe("updateStayInput", () => {
  it("requires a reason", () => {
    const base = {
      id: "11111111-1111-4111-8111-111111111111",
      locationId: "22222222-2222-4222-8222-222222222222",
      startDate: "2027-07-04",
      nights: 8,
      kind: "festival" as const,
      informationState: "estimate" as const,
    };
    expect(updateStayInput.safeParse(base).success).toBe(false);
    expect(updateStayInput.safeParse({ ...base, reason: "Counted wrong the first time" }).success).toBe(true);
  });
});

describe("deleteStayInput", () => {
  it("requires a reason", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(deleteStayInput.safeParse({ id }).success).toBe(false);
    expect(deleteStayInput.safeParse({ id, reason: "No longer part of the plan" }).success).toBe(true);
  });
});
