import { describe, expect, it } from "vitest";

import { checkObservationCoversStay, describeObservationMismatch } from "./check-observation-covers-stay";

describe("checkObservationCoversStay", () => {
  it("is undated when the option has no observed start date", () => {
    const result = checkObservationCoversStay({
      option: { observedStartDate: null, nights: 5 },
      stay: { startDate: "2028-07-10", nights: 5 },
    });
    expect(result.status).toBe("undated");
  });

  it("is ok when the observed window exactly matches the stay", () => {
    const result = checkObservationCoversStay({
      option: { observedStartDate: "2028-07-10", nights: 5 },
      stay: { startDate: "2028-07-10", nights: 5 },
    });
    expect(result).toEqual({ status: "ok", yearShifted: false });
  });

  it("is ok, with yearShifted true, for A-009's sanctioned whole-year placeholder", () => {
    const result = checkObservationCoversStay({
      option: { observedStartDate: "2027-07-10", nights: 5 },
      stay: { startDate: "2028-07-10", nights: 5 },
    });
    expect(result).toEqual({ status: "ok", yearShifted: true });
  });

  it("flags a night-count mismatch before comparing dates at all", () => {
    const result = checkObservationCoversStay({
      option: { observedStartDate: "2028-07-10", nights: 3 },
      stay: { startDate: "2028-07-10", nights: 5 },
    });
    expect(result).toEqual({ status: "night_count_differs", optionNights: 3, stayNights: 5 });
  });

  it("flags a genuine day slip within the same year", () => {
    const result = checkObservationCoversStay({
      option: { observedStartDate: "2028-07-02", nights: 5 },
      stay: { startDate: "2028-07-03", nights: 5 },
    });
    expect(result).toEqual({
      status: "dates_differ",
      observedRange: { start: "2028-07-02", end: "2028-07-07" },
      stayRange: { start: "2028-07-03", end: "2028-07-08" },
      yearShifted: false,
    });
  });

  it("flags a day slip even when the year also differs -- the day defect, not the sanctioned year shift", () => {
    const result = checkObservationCoversStay({
      option: { observedStartDate: "2027-07-02", nights: 5 },
      stay: { startDate: "2028-07-03", nights: 5 },
    });
    expect(result.status).toBe("dates_differ");
    expect(result as { yearShifted: boolean }).toMatchObject({ yearShifted: true });
  });
});

describe("describeObservationMismatch", () => {
  it("describes a night-count mismatch", () => {
    const message = describeObservationMismatch({
      status: "night_count_differs",
      optionNights: 3,
      stayNights: 5,
    });
    expect(message).toContain("3 night(s)");
    expect(message).toContain("5 night(s)");
  });

  it("describes a date mismatch with both ranges", () => {
    const message = describeObservationMismatch({
      status: "dates_differ",
      observedRange: { start: "2028-07-02", end: "2028-07-07" },
      stayRange: { start: "2028-07-03", end: "2028-07-08" },
      yearShifted: false,
    });
    expect(message).toContain("2028-07-02 to 2028-07-07");
    expect(message).toContain("2028-07-03 to 2028-07-08");
  });
});
