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

  describe("A-009: a whole-year offset is the declared placeholder, not a failure", () => {
    it("passes a 2028 stay against a 2027 quote on the same month and day, with a note", () => {
      // The production case that showed a red Fail.
      const result = checkAccommodationDatesCovered({
        stayStartDate: "2028-07-03",
        stayNights: 1,
        applicablePeriod: { start: "2027-07-03", end: "2027-07-12" },
      });
      expect(result.status).toBe("pass");
      expect(result.reasons).toEqual([
        "priced on 2027 dates (2027-07-03 to 2027-07-12), carried forward to 2028 under A-009",
      ]);
    });

    it("does not mention A-009 when the quote is already for the stay's own year", () => {
      const result = checkAccommodationDatesCovered({
        stayStartDate: "2028-07-03",
        stayNights: 1,
        applicablePeriod: { start: "2028-07-03", end: "2028-07-12" },
      });
      expect(result.reasons.join(" ")).not.toContain("A-009");
    });

    it("still fails a genuine day slip, even after the year shift", () => {
      const result = checkAccommodationDatesCovered({
        stayStartDate: "2028-07-01",
        stayNights: 3,
        applicablePeriod: { start: "2027-07-03", end: "2027-07-12" },
      });
      expect(result.status).toBe("fail");
    });

    it("still fails a stay running past the shifted range's end", () => {
      const result = checkAccommodationDatesCovered({
        stayStartDate: "2028-07-10",
        stayNights: 5,
        applicablePeriod: { start: "2027-07-03", end: "2027-07-12" },
      });
      expect(result.status).toBe("fail");
    });

    it("carries forward a quoted range that crosses New Year", () => {
      const result = checkAccommodationDatesCovered({
        stayStartDate: "2029-01-01",
        stayNights: 2,
        applicablePeriod: { start: "2027-12-28", end: "2028-01-05" },
      });
      expect(result.status).toBe("pass");
    });

    it("carries forward a range open on its start side", () => {
      const result = checkAccommodationDatesCovered({
        stayStartDate: "2028-07-03",
        stayNights: 1,
        applicablePeriod: { start: null, end: "2027-07-12" },
      });
      expect(result.status).toBe("pass");
    });
  });
});
