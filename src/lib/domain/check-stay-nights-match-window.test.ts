import { describe, expect, it } from "vitest";

import { checkStayNightsMatchWindow } from "./check-stay-nights-match-window";
import { resolveTravelWindow, type TravelWindowFields } from "./resolve-travel-window";

describe("checkStayNightsMatchWindow", () => {
  it("reports unknown when the trip's travel window isn't set", () => {
    const result = checkStayNightsMatchWindow({
      stays: [{ nights: 8 }],
      movements: [],
      departureDate: null,
      returnDate: "2027-07-13",
    });
    expect(result).toEqual({ status: "unknown" });
  });

  it("passes when the stays' nights add up to the travel window", () => {
    const result = checkStayNightsMatchWindow({
      stays: [{ nights: 5 }, { nights: 3 }],
      movements: [],
      departureDate: "2027-07-04",
      returnDate: "2027-07-12",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("flags a budget priced for a different trip length than the ticket", () => {
    const result = checkStayNightsMatchWindow({
      stays: [{ nights: 21 }],
      movements: [],
      departureDate: "2027-07-04",
      returnDate: "2027-07-15",
    });
    expect(result).toEqual({ status: "mismatch", staysNights: 21, windowNights: 11 });
  });

  it("doesn't crash with no stays at all", () => {
    const result = checkStayNightsMatchWindow({
      stays: [],
      movements: [],
      departureDate: "2027-07-04",
      returnDate: "2027-07-04",
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
      departureDate: "2027-07-02",
      returnDate: "2027-07-14",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("uses an overriding scenario's own window, not the trip's, once resolved", () => {
    const trip: TravelWindowFields = {
      departureDate: "2027-07-04",
      returnDate: "2027-07-15",
      travelDatesState: "estimate",
      travelDatesSourceId: null,
    };
    const scenario: TravelWindowFields = {
      departureDate: "2027-07-04",
      returnDate: "2027-07-12",
      travelDatesState: "estimate",
      travelDatesSourceId: null,
    };
    const window = resolveTravelWindow(scenario, trip);
    expect(window.origin).toBe("scenario");

    // Matches the scenario's shorter 8-night window, not the trip's
    // 11-night one -- if this read trip.returnDate directly instead of
    // the resolved window, it would report a mismatch instead.
    const result = checkStayNightsMatchWindow({
      stays: [{ nights: 8 }],
      movements: [],
      departureDate: window.departureDate,
      returnDate: window.returnDate,
    });
    expect(result).toEqual({ status: "ok" });
  });
});
