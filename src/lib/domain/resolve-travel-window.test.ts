import { describe, expect, it } from "vitest";

import { resolveTravelWindow, type TravelWindowFields } from "./resolve-travel-window";

const TRIP: TravelWindowFields = {
  departureDate: "2028-07-02",
  returnDate: "2028-07-14",
  travelDatesState: "estimate",
  travelDatesSourceId: null,
};

const NO_WINDOW: TravelWindowFields = {
  departureDate: null,
  returnDate: null,
  travelDatesState: "pending",
  travelDatesSourceId: null,
};

const SCENARIO_OVERRIDE: TravelWindowFields = {
  departureDate: "2028-06-28",
  returnDate: "2028-07-10",
  travelDatesState: "confirmed",
  travelDatesSourceId: "source-1",
};

describe("resolveTravelWindow", () => {
  it("inherits the trip's window when the scenario has none of its own", () => {
    const result = resolveTravelWindow(NO_WINDOW, TRIP);
    expect(result).toEqual({ ...TRIP, origin: "trip" });
  });

  it("uses the scenario's own window when it has set one, not the trip's", () => {
    const result = resolveTravelWindow(SCENARIO_OVERRIDE, TRIP);
    expect(result).toEqual({ ...SCENARIO_OVERRIDE, origin: "scenario" });
  });

  it("inherits the trip's own unset window when neither has one", () => {
    const result = resolveTravelWindow(NO_WINDOW, NO_WINDOW);
    expect(result).toEqual({ ...NO_WINDOW, origin: "trip" });
  });
});
