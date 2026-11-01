import { describe, expect, it } from "vitest";

import { observationAgeDays, RATE_STALENESS_DAYS, SOURCE_STALENESS_DAYS } from "./observation-age";

describe("observationAgeDays", () => {
  it("is zero when observed today", () => {
    expect(observationAgeDays("2028-01-01", "2028-01-01")).toBe(0);
  });

  it("counts whole days between observedOn and asOfDate", () => {
    expect(observationAgeDays("2028-01-01", "2028-01-15")).toBe(14);
  });
});

describe("staleness thresholds", () => {
  it("are at the boundary exactly where a caller would compare against age", () => {
    // Exactly at the threshold reads as "not yet stale"; one day past does.
    expect(observationAgeDays("2028-01-01", "2028-01-15")).toBe(RATE_STALENESS_DAYS);
    expect(observationAgeDays("2028-01-01", "2028-01-16")).toBeGreaterThan(RATE_STALENESS_DAYS);
    expect(observationAgeDays("2028-01-01", "2028-03-02")).toBeGreaterThan(SOURCE_STALENESS_DAYS);
  });
});
