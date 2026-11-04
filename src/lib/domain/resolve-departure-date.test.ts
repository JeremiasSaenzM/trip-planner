import { describe, expect, it } from "vitest";

import { resolveDepartureDate } from "./resolve-departure-date";

describe("resolveDepartureDate", () => {
  it("uses the trip's own departure date when it's set, even if the event has dates", () => {
    expect(
      resolveDepartureDate({
        windowDepartureDate: "2028-07-02",
        windowTravelDatesState: "estimate",
        windowOrigin: "trip",
        eventStartDate: "2028-07-05",
        eventDatesState: "confirmed",
      }),
    ).toEqual({ date: "2028-07-02", source: "trip", confirmed: false });
  });

  it("reports the trip date as confirmed only when the travel dates are", () => {
    expect(
      resolveDepartureDate({
        windowDepartureDate: "2028-07-02",
        windowTravelDatesState: "confirmed",
        windowOrigin: "trip",
        eventStartDate: null,
        eventDatesState: null,
      }),
    ).toEqual({ date: "2028-07-02", source: "trip", confirmed: true });
  });

  it("uses a scenario's own override, reporting the scenario as the source", () => {
    expect(
      resolveDepartureDate({
        windowDepartureDate: "2028-06-28",
        windowTravelDatesState: "confirmed",
        windowOrigin: "scenario",
        eventStartDate: "2028-07-05",
        eventDatesState: "confirmed",
      }),
    ).toEqual({ date: "2028-06-28", source: "scenario", confirmed: true });
  });

  it("falls back to the event's first official day when the window has no departure date", () => {
    expect(
      resolveDepartureDate({
        windowDepartureDate: null,
        windowTravelDatesState: "pending",
        windowOrigin: "trip",
        eventStartDate: "2028-07-05",
        eventDatesState: "confirmed",
      }),
    ).toEqual({ date: "2028-07-05", source: "event", confirmed: true });
  });

  it("returns null when neither exists", () => {
    expect(
      resolveDepartureDate({
        windowDepartureDate: null,
        windowTravelDatesState: "pending",
        windowOrigin: "trip",
        eventStartDate: null,
        eventDatesState: null,
      }),
    ).toBeNull();
  });
});
