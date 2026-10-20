import { describe, expect, it } from "vitest";

import type { Scenario } from "@/lib/data/types";

import { sortScenarios } from "./scenario-order";

function scenario(id: string, createdAt: string): Scenario {
  return {
    id,
    tripId: "trip",
    name: id,
    competitionId: null,
    includesExtension: false,
    notes: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("sortScenarios", () => {
  it("puts the oldest scenario first, whatever order they arrive in", () => {
    const sorted = sortScenarios([
      scenario("b", "2026-10-02T00:00:00Z"),
      scenario("a", "2026-10-01T00:00:00Z"),
      scenario("c", "2026-10-03T00:00:00Z"),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks a createdAt tie by id, so the order is stable", () => {
    const sorted = sortScenarios([scenario("y", "2026-10-01T00:00:00Z"), scenario("x", "2026-10-01T00:00:00Z")]);
    expect(sorted.map((s) => s.id)).toEqual(["x", "y"]);
  });

  it("doesn't mutate its input", () => {
    const input = [scenario("b", "2026-10-02T00:00:00Z"), scenario("a", "2026-10-01T00:00:00Z")];
    sortScenarios(input);
    expect(input.map((s) => s.id)).toEqual(["b", "a"]);
  });
});
