import { describe, expect, it } from "vitest";

import { checkTravelWindow } from "./check-travel-window";

const FESTIVAL = { festivalStartDate: "2028-07-05", festivalEndDate: "2028-07-09" };

describe("checkTravelWindow", () => {
  it("passes a window that starts before the festival and ends after it", () => {
    expect(checkTravelWindow({ ...FESTIVAL, departureDate: "2028-07-02", returnDate: "2028-07-25" })).toEqual([]);
  });

  it("flags leaving on the first festival day -- too late to be there before it begins", () => {
    expect(checkTravelWindow({ ...FESTIVAL, departureDate: "2028-07-05", returnDate: "2028-07-25" })).toEqual([
      "leaves_too_late",
    ]);
  });

  it("flags coming home on the final festival day -- that means leaving before it ends", () => {
    expect(checkTravelWindow({ ...FESTIVAL, departureDate: "2028-07-02", returnDate: "2028-07-09" })).toEqual([
      "returns_too_early",
    ]);
  });

  it("never flags a date that isn't set, on either side", () => {
    expect(checkTravelWindow({ ...FESTIVAL, departureDate: null, returnDate: null })).toEqual([]);
    expect(
      checkTravelWindow({ departureDate: "2028-07-09", returnDate: "2028-07-05", festivalStartDate: null, festivalEndDate: null }),
    ).toEqual([]);
  });
});
