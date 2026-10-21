import { describe, expect, it } from "vitest";

import { resolveDepartureDate } from "./resolve-departure-date";

describe("resolveDepartureDate", () => {
  it("uses the trip's own departure date when it's set, even if the competition has dates", () => {
    expect(
      resolveDepartureDate({
        tripDepartureDate: "2028-07-02",
        tripTravelDatesState: "estimate",
        competitionStartDate: "2028-07-05",
        competitionDatesState: "confirmed",
      }),
    ).toEqual({ date: "2028-07-02", source: "trip", confirmed: false });
  });

  it("reports the trip date as confirmed only when the travel dates are", () => {
    expect(
      resolveDepartureDate({
        tripDepartureDate: "2028-07-02",
        tripTravelDatesState: "confirmed",
        competitionStartDate: null,
        competitionDatesState: null,
      }),
    ).toEqual({ date: "2028-07-02", source: "trip", confirmed: true });
  });

  it("falls back to the competition's first official day when the trip has no departure date", () => {
    expect(
      resolveDepartureDate({
        tripDepartureDate: null,
        tripTravelDatesState: "pending",
        competitionStartDate: "2028-07-05",
        competitionDatesState: "confirmed",
      }),
    ).toEqual({ date: "2028-07-05", source: "competition", confirmed: true });
  });

  it("returns null when neither exists", () => {
    expect(
      resolveDepartureDate({
        tripDepartureDate: null,
        tripTravelDatesState: "pending",
        competitionStartDate: null,
        competitionDatesState: null,
      }),
    ).toBeNull();
  });
});
