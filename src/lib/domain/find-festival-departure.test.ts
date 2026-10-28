import { describe, expect, it } from "vitest";

import { findFestivalDeparture } from "./find-festival-departure";

describe("findFestivalDeparture", () => {
  it("is known, in the departure location's own zone, when the departing movement has a time of day", () => {
    const result = findFestivalDeparture({
      festivalStayLocationId: "Llangollen",
      movements: [
        { sequence: 1, fromLocationId: "Home", fromZone: null, departDate: "2027-07-01", departTime: "08:00:00" },
        { sequence: 2, fromLocationId: "Llangollen", fromZone: "Europe/London", departDate: "2027-07-10", departTime: "09:00:00" },
      ],
    });
    // 9am on 10 July, read as Europe/London (BST, +01:00), not as UTC.
    expect(result).toEqual({ status: "known", departsAt: "2027-07-10T09:00:00.000+01:00" });
  });

  it("bounds the day, in the departure location's own zone, when the departing movement has no time of day", () => {
    const result = findFestivalDeparture({
      festivalStayLocationId: "Llangollen",
      movements: [
        { sequence: 1, fromLocationId: "Llangollen", fromZone: "Europe/London", departDate: "2027-07-10", departTime: null },
      ],
    });
    expect(result).toEqual({
      status: "bounded",
      earliestDepartsAt: "2027-07-10T00:00:00.000+01:00",
      latestDepartsAt: "2027-07-10T23:59:00.000+01:00",
    });
  });

  it("picks the last movement leaving the festival location, not the first -- a day trip out and back doesn't count as leaving for good", () => {
    const result = findFestivalDeparture({
      festivalStayLocationId: "Llangollen",
      movements: [
        // Day trip to Chester and back, mid-festival.
        { sequence: 1, fromLocationId: "Llangollen", fromZone: "Europe/London", departDate: "2027-07-06", departTime: "10:00:00" },
        { sequence: 2, fromLocationId: "Chester", fromZone: "Europe/London", departDate: "2027-07-06", departTime: "18:00:00" },
        // Leaving for good, after the festival ends.
        { sequence: 3, fromLocationId: "Llangollen", fromZone: "Europe/London", departDate: "2027-07-10", departTime: "09:00:00" },
      ],
    });
    expect(result).toEqual({ status: "known", departsAt: "2027-07-10T09:00:00.000+01:00" });
  });

  it("is unknown when no festival-kind stay is recorded yet", () => {
    const result = findFestivalDeparture({ festivalStayLocationId: null, movements: [] });
    expect(result).toEqual({ status: "unknown", reason: "no festival-kind stay recorded to depart from" });
  });

  it("is unknown when the departure location has no time zone recorded yet", () => {
    const result = findFestivalDeparture({
      festivalStayLocationId: "Llangollen",
      movements: [{ sequence: 1, fromLocationId: "Llangollen", fromZone: null, departDate: "2027-07-10", departTime: "09:00:00" }],
    });
    expect(result).toEqual({ status: "unknown", reason: "the departure location has no time zone recorded yet" });
  });

  it("is unknown when the movement chain never leaves the festival stay's location", () => {
    const result = findFestivalDeparture({
      festivalStayLocationId: "Llangollen",
      movements: [{ sequence: 1, fromLocationId: "Home", fromZone: null, departDate: "2027-07-01", departTime: "08:00:00" }],
    });
    expect(result).toEqual({ status: "unknown", reason: "the movement chain never leaves the festival stay's location" });
  });
});
