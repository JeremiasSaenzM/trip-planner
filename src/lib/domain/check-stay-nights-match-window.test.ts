import { describe, expect, it } from "vitest";

import { checkStayNightsMatchWindow } from "./check-stay-nights-match-window";

describe("checkStayNightsMatchWindow", () => {
  it("reports unknown when the trip's travel window isn't set", () => {
    const result = checkStayNightsMatchWindow({
      stays: [{ nights: 8 }],
      tripDepartureDate: null,
      tripReturnDate: "2027-07-13",
    });
    expect(result).toEqual({ status: "unknown" });
  });

  it("passes when the stays' nights add up to the travel window", () => {
    const result = checkStayNightsMatchWindow({
      stays: [{ nights: 5 }, { nights: 3 }],
      tripDepartureDate: "2027-07-04",
      tripReturnDate: "2027-07-12",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("flags a budget priced for a different trip length than the ticket", () => {
    const result = checkStayNightsMatchWindow({
      stays: [{ nights: 21 }],
      tripDepartureDate: "2027-07-04",
      tripReturnDate: "2027-07-15",
    });
    expect(result).toEqual({ status: "mismatch", staysNights: 21, windowNights: 11 });
  });

  it("doesn't crash with no stays at all", () => {
    const result = checkStayNightsMatchWindow({
      stays: [],
      tripDepartureDate: "2027-07-04",
      tripReturnDate: "2027-07-04",
    });
    expect(result).toEqual({ status: "ok" });
  });
});
