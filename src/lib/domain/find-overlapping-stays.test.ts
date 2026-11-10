import { describe, expect, it } from "vitest";

import { findOverlappingStays } from "./find-overlapping-stays";

describe("findOverlappingStays", () => {
  it("finds nothing when stays run back to back with no shared night", () => {
    const overlaps = findOverlappingStays([
      { id: "s1", locationId: "paris", startDate: "2028-07-01", nights: 2 },
      { id: "s2", locationId: "london", startDate: "2028-07-03", nights: 2 },
    ]);
    expect(overlaps).toEqual([]);
  });

  it("does not flag the same location covering a night twice", () => {
    const overlaps = findOverlappingStays([
      { id: "s1", locationId: "paris", startDate: "2028-07-01", nights: 3 },
      { id: "s2", locationId: "paris", startDate: "2028-07-02", nights: 2 },
    ]);
    expect(overlaps).toEqual([]);
  });

  it("flags a night covered by two stays at different locations", () => {
    const overlaps = findOverlappingStays([
      { id: "s1", locationId: "paris", startDate: "2028-07-01", nights: 2 },
      { id: "s2", locationId: "london", startDate: "2028-07-02", nights: 2 },
    ]);
    expect(overlaps).toEqual([
      {
        date: "2028-07-02",
        stays: [
          { id: "s1", locationId: "paris" },
          { id: "s2", locationId: "london" },
        ],
      },
    ]);
  });
});
