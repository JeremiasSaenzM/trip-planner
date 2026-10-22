import { describe, expect, it } from "vitest";

import { checkFestivalStayCoverage } from "./check-festival-stay-coverage";

describe("checkFestivalStayCoverage", () => {
  it("reports unknown when the competition has no dates yet", () => {
    const result = checkFestivalStayCoverage({
      stays: [{ kind: "festival", startDate: "2027-07-04", nights: 8 }],
      festivalStartDate: null,
      festivalEndDate: "2027-07-11",
    });
    expect(result).toEqual({ status: "unknown" });
  });

  it("passes when a festival stay spans the night before through the final night", () => {
    const result = checkFestivalStayCoverage({
      stays: [{ kind: "festival", startDate: "2027-07-04", nights: 8 }],
      festivalStartDate: "2027-07-05",
      festivalEndDate: "2027-07-11",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("flags the nights a festival stay doesn't cover", () => {
    const result = checkFestivalStayCoverage({
      // Starts on the first festival day itself, not the night before --
      // and ends two nights early.
      stays: [{ kind: "festival", startDate: "2027-07-05", nights: 5 }],
      festivalStartDate: "2027-07-05",
      festivalEndDate: "2027-07-11",
    });
    expect(result).toEqual({
      status: "gap",
      uncoveredNights: ["2027-07-04", "2027-07-10", "2027-07-11"],
    });
  });

  it("ignores a non-festival stay even if its dates would otherwise cover the gap", () => {
    const result = checkFestivalStayCoverage({
      stays: [{ kind: "independent", startDate: "2027-07-04", nights: 8 }],
      festivalStartDate: "2027-07-05",
      festivalEndDate: "2027-07-11",
    });
    expect(result.status).toBe("gap");
  });

  it("doesn't crash with no stays at all", () => {
    const result = checkFestivalStayCoverage({
      stays: [],
      festivalStartDate: "2027-07-05",
      festivalEndDate: "2027-07-05",
    });
    expect(result).toEqual({ status: "gap", uncoveredNights: ["2027-07-04", "2027-07-05"] });
  });
});
