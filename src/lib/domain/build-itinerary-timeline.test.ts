import { describe, expect, it } from "vitest";

import { buildItineraryTimeline, checkNightsAccountedFor, checkPathContinuity } from "./build-itinerary-timeline";

describe("buildItineraryTimeline", () => {
  it("returns nothing for a scenario with no movements", () => {
    expect(buildItineraryTimeline([])).toEqual([]);
  });

  it("walks a single-city trip night by night", () => {
    const days = buildItineraryTimeline([
      { sequence: 1, fromLocationId: "Home", toLocationId: "Fontvieux", departDate: "2027-07-04", arriveDate: "2027-07-04" },
      { sequence: 2, fromLocationId: "Fontvieux", toLocationId: "Home", departDate: "2027-07-06", arriveDate: "2027-07-07" },
    ]);

    expect(days.map((day) => [day.date, day.night])).toEqual([
      ["2027-07-04", { type: "at", locationId: "Fontvieux" }],
      ["2027-07-05", { type: "at", locationId: "Fontvieux" }],
      ["2027-07-06", { type: "in_transit" }],
      ["2027-07-07", { type: "home" }],
    ]);
  });
});

describe("checkPathContinuity", () => {
  it("passes a single-city trip (two movements, one stay)", () => {
    const movements = [
      { sequence: 1, fromLocationId: "Home", toLocationId: "Fontvieux", departDate: "2027-07-04", arriveDate: "2027-07-04" },
      { sequence: 2, fromLocationId: "Fontvieux", toLocationId: "Home", departDate: "2027-07-12", arriveDate: "2027-07-13" },
    ];
    expect(checkPathContinuity(movements)).toEqual([]);
  });

  it("passes a day trip to a place with no stay", () => {
    const movements = [
      { sequence: 1, fromLocationId: "Home", toLocationId: "Madrid", departDate: "2027-07-01", arriveDate: "2027-07-01" },
      { sequence: 2, fromLocationId: "Madrid", toLocationId: "Toledo", departDate: "2027-07-05", arriveDate: "2027-07-05" },
      { sequence: 3, fromLocationId: "Toledo", toLocationId: "Madrid", departDate: "2027-07-05", arriveDate: "2027-07-05" },
      { sequence: 4, fromLocationId: "Madrid", toLocationId: "Home", departDate: "2027-07-10", arriveDate: "2027-07-10" },
    ];
    expect(checkPathContinuity(movements)).toEqual([]);
  });

  it("passes arriving in one city and departing from another, when a movement connects them", () => {
    const movements = [
      { sequence: 1, fromLocationId: "Home", toLocationId: "Madrid", departDate: "2027-07-01", arriveDate: "2027-07-01" },
      { sequence: 2, fromLocationId: "Madrid", toLocationId: "Barcelona", departDate: "2027-07-05", arriveDate: "2027-07-05" },
      { sequence: 3, fromLocationId: "Barcelona", toLocationId: "Home", departDate: "2027-07-10", arriveDate: "2027-07-10" },
    ];
    expect(checkPathContinuity(movements)).toEqual([]);
  });

  it("fails departing from a city the traveller isn't in on the final day", () => {
    const movements = [
      { sequence: 1, fromLocationId: "Home", toLocationId: "Madrid", departDate: "2027-07-01", arriveDate: "2027-07-01" },
      // No movement ever takes the traveller to Barcelona.
      { sequence: 2, fromLocationId: "Barcelona", toLocationId: "Home", departDate: "2027-07-10", arriveDate: "2027-07-10" },
    ];
    expect(checkPathContinuity(movements)).toEqual([
      { sequence: 2, expectedFromLocationId: "Madrid", actualFromLocationId: "Barcelona" },
    ]);
  });

  it("doesn't crash with no movements at all", () => {
    expect(checkPathContinuity([])).toEqual([]);
  });
});

describe("checkNightsAccountedFor", () => {
  it("passes a single-city trip (two movements, one stay)", () => {
    const movements = [
      { sequence: 1, fromLocationId: "Home", toLocationId: "Fontvieux", departDate: "2027-07-04", arriveDate: "2027-07-04" },
      { sequence: 2, fromLocationId: "Fontvieux", toLocationId: "Home", departDate: "2027-07-06", arriveDate: "2027-07-07" },
    ];
    const stays = [{ locationId: "Fontvieux", startDate: "2027-07-04", nights: 2 }];
    expect(checkNightsAccountedFor(movements, stays)).toEqual([]);
  });

  it("passes a day trip to a place with no stay", () => {
    const movements = [
      { sequence: 1, fromLocationId: "Home", toLocationId: "Madrid", departDate: "2027-07-01", arriveDate: "2027-07-01" },
      { sequence: 2, fromLocationId: "Madrid", toLocationId: "Toledo", departDate: "2027-07-05", arriveDate: "2027-07-05" },
      { sequence: 3, fromLocationId: "Toledo", toLocationId: "Madrid", departDate: "2027-07-05", arriveDate: "2027-07-05" },
      { sequence: 4, fromLocationId: "Madrid", toLocationId: "Home", departDate: "2027-07-10", arriveDate: "2027-07-10" },
    ];
    // Every night, including the 5th (the day-trip day), is spent in
    // Madrid -- Toledo never needs its own stay.
    const stays = [{ locationId: "Madrid", startDate: "2027-07-01", nights: 9 }];
    expect(checkNightsAccountedFor(movements, stays)).toEqual([]);
  });

  it("passes an overnight flight with no stay for that night", () => {
    // San Jose 09:25 July 2 -> Paris 06:55 July 3: the night of July 2
    // is spent in the air, not in a bed.
    const movements = [
      { sequence: 1, fromLocationId: "Home", toLocationId: "San Jose", departDate: "2027-07-01", arriveDate: "2027-07-01" },
      { sequence: 2, fromLocationId: "San Jose", toLocationId: "Paris", departDate: "2027-07-02", arriveDate: "2027-07-03" },
      { sequence: 3, fromLocationId: "Paris", toLocationId: "Home", departDate: "2027-07-10", arriveDate: "2027-07-10" },
    ];
    const stays = [
      { locationId: "San Jose", startDate: "2027-07-01", nights: 1 },
      { locationId: "Paris", startDate: "2027-07-03", nights: 7 },
    ];
    expect(checkNightsAccountedFor(movements, stays)).toEqual([]);
  });

  it("flags a night with no stay at the location the chain actually leaves the traveller in", () => {
    const movements = [
      { sequence: 1, fromLocationId: "Home", toLocationId: "Fontvieux", departDate: "2027-07-04", arriveDate: "2027-07-04" },
      { sequence: 2, fromLocationId: "Fontvieux", toLocationId: "Home", departDate: "2027-07-07", arriveDate: "2027-07-07" },
    ];
    // Covers the first two nights only -- 07-06 is missing.
    const stays = [{ locationId: "Fontvieux", startDate: "2027-07-04", nights: 2 }];
    expect(checkNightsAccountedFor(movements, stays)).toEqual([{ date: "2027-07-06", requiredLocationId: "Fontvieux" }]);
  });

  it("doesn't crash with no stays and no movements", () => {
    expect(checkNightsAccountedFor([], [])).toEqual([]);
  });
});
