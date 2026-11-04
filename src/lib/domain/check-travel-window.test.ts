import { describe, expect, it } from "vitest";

import { checkTravelWindow } from "./check-travel-window";
import { resolveTravelWindow, type TravelWindowFields } from "./resolve-travel-window";

const EVENT = { eventStartDate: "2028-07-05", eventEndDate: "2028-07-09" };

describe("checkTravelWindow", () => {
  it("passes a window that starts before the event and ends after it", () => {
    expect(checkTravelWindow({ ...EVENT, departureDate: "2028-07-02", returnDate: "2028-07-25" })).toEqual([]);
  });

  it("flags leaving on the first event day -- too late to be there before it begins", () => {
    expect(checkTravelWindow({ ...EVENT, departureDate: "2028-07-05", returnDate: "2028-07-25" })).toEqual([
      "leaves_too_late",
    ]);
  });

  it("flags coming home on the final event day -- that means leaving before it ends", () => {
    expect(checkTravelWindow({ ...EVENT, departureDate: "2028-07-02", returnDate: "2028-07-09" })).toEqual([
      "returns_too_early",
    ]);
  });

  it("never flags a date that isn't set, on either side", () => {
    expect(checkTravelWindow({ ...EVENT, departureDate: null, returnDate: null })).toEqual([]);
    expect(
      checkTravelWindow({ departureDate: "2028-07-09", returnDate: "2028-07-05", eventStartDate: null, eventEndDate: null }),
    ).toEqual([]);
  });

  it("uses an overriding scenario's own window, not the trip's, once resolved", () => {
    const trip: TravelWindowFields = {
      departureDate: "2028-07-05", // would flag leaves_too_late on its own
      returnDate: "2028-07-25",
      travelDatesState: "estimate",
      travelDatesSourceId: null,
    };
    const scenario: TravelWindowFields = {
      departureDate: "2028-07-02",
      returnDate: "2028-07-25",
      travelDatesState: "estimate",
      travelDatesSourceId: null,
    };
    const window = resolveTravelWindow(scenario, trip);
    expect(window.origin).toBe("scenario");

    expect(checkTravelWindow({ ...EVENT, departureDate: window.departureDate, returnDate: window.returnDate })).toEqual(
      [],
    );
  });
});
