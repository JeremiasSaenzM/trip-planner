import { describe, expect, it } from "vitest";

import type { Trip } from "@/lib/data/types";

import { sortTrips } from "./trip-order";

function trip(id: string, createdAt: string, departureDate: string | null = null): Trip {
  return {
    id,
    name: id,
    status: "planning",
    departureDate,
    returnDate: null,
    travelDatesState: "pending",
    travelDatesSourceId: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("sortTrips", () => {
  it("puts the trip with the earliest departure date first", () => {
    const sorted = sortTrips([
      trip("b", "2026-10-02T00:00:00Z", "2027-06-01"),
      trip("a", "2026-10-01T00:00:00Z", "2027-01-15"),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("sorts an undated trip after every dated one, whichever order they arrive in", () => {
    const sorted = sortTrips([
      trip("undated", "2026-10-01T00:00:00Z", null),
      trip("dated", "2026-10-02T00:00:00Z", "2028-07-01"),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["dated", "undated"]);
  });

  it("falls back to the oldest trip when neither has a departure date", () => {
    const sorted = sortTrips([
      trip("b", "2026-10-02T00:00:00Z"),
      trip("a", "2026-10-01T00:00:00Z"),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("breaks a createdAt tie by id, so the order is stable", () => {
    const sorted = sortTrips([trip("y", "2026-10-01T00:00:00Z"), trip("x", "2026-10-01T00:00:00Z")]);
    expect(sorted.map((t) => t.id)).toEqual(["x", "y"]);
  });

  it("doesn't mutate its input", () => {
    const input = [trip("b", "2026-10-02T00:00:00Z"), trip("a", "2026-10-01T00:00:00Z")];
    sortTrips(input);
    expect(input.map((t) => t.id)).toEqual(["b", "a"]);
  });
});
