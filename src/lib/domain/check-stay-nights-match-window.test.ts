import { describe, expect, it } from "vitest";

import { checkStayNightsMatchWindow } from "./check-stay-nights-match-window";

describe("checkStayNightsMatchWindow", () => {
  it("reports unknown when the trip's travel window isn't set", () => {
    const result = checkStayNightsMatchWindow({
      stays: [{ nights: 8 }],
      movements: [],
      tripDepartureDate: null,
      tripReturnDate: "2027-07-13",
    });
    expect(result).toEqual({ status: "unknown" });
  });

  it("passes when the stays' nights add up to the travel window", () => {
    const result = checkStayNightsMatchWindow({
      stays: [{ nights: 5 }, { nights: 3 }],
      movements: [],
      tripDepartureDate: "2027-07-04",
      tripReturnDate: "2027-07-12",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("flags a budget priced for a different trip length than the ticket", () => {
    const result = checkStayNightsMatchWindow({
      stays: [{ nights: 21 }],
      movements: [],
      tripDepartureDate: "2027-07-04",
      tripReturnDate: "2027-07-15",
    });
    expect(result).toEqual({ status: "mismatch", staysNights: 21, windowNights: 11 });
  });

  it("doesn't crash with no stays at all", () => {
    const result = checkStayNightsMatchWindow({
      stays: [],
      movements: [],
      tripDepartureDate: "2027-07-04",
      tripReturnDate: "2027-07-04",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("subtracts a night spent on an overnight movement, same as checkNightsAccountedFor", () => {
    // Departure Jul 2, return Jul 14: 12 nights, but the outbound leg
    // departs the 2nd and lands the 3rd, so only 11 nights need a bed.
    const result = checkStayNightsMatchWindow({
      stays: [{ nights: 11 }],
      movements: [
        { sequence: 1, fromLocationId: "Home", toLocationId: "Away", departDate: "2027-07-02", arriveDate: "2027-07-03" },
      ],
      tripDepartureDate: "2027-07-02",
      tripReturnDate: "2027-07-14",
    });
    expect(result).toEqual({ status: "ok" });
  });
});
