import { describe, expect, it } from "vitest";

import { checkAccommodationDatesCovered } from "./check-accommodation-dates-covered";

describe("checkAccommodationDatesCovered", () => {
  it("returns unknown when the source states no date range at all", () => {
    const result = checkAccommodationDatesCovered({
      stayStartDate: "2028-07-10",
      stayNights: 3,
      applicablePeriod: null,
    });
    expect(result.status).toBe("unknown");
  });

  it("passes when the stay's range falls inside a fully bounded period", () => {
    const result = checkAccommodationDatesCovered({
      stayStartDate: "2028-07-10",
      stayNights: 3,
      applicablePeriod: { start: "2028-07-01", end: "2028-08-01" },
    });
    expect(result.status).toBe("pass");
  });

  it("passes when the period is open on one side and the stay fits the bounded side", () => {
    const result = checkAccommodationDatesCovered({
      stayStartDate: "2028-07-10",
      stayNights: 3,
      applicablePeriod: { start: "2028-07-01", end: null },
    });
    expect(result.status).toBe("pass");
  });

  it("fails when the stay starts before the quoted range begins", () => {
    const result = checkAccommodationDatesCovered({
      stayStartDate: "2028-06-25",
      stayNights: 3,
      applicablePeriod: { start: "2028-07-01", end: "2028-08-01" },
    });
    expect(result.status).toBe("fail");
  });

  it("fails when the stay ends after the quoted range closes", () => {
    const result = checkAccommodationDatesCovered({
      stayStartDate: "2028-07-30",
      stayNights: 5,
      applicablePeriod: { start: "2028-07-01", end: "2028-08-01" },
    });
    expect(result.status).toBe("fail");
  });
});
