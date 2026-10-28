import { describe, expect, it } from "vitest";

import { calculateOnwardTravelMinutes } from "./calculate-onward-travel-minutes";

const FLIGHT_OPTION_ID = "f0000000-0000-0000-0000-000000000001";
const PARIS = "Europe/Paris"; // UTC+2 in July (CEST)
const LONDON = "Europe/London"; // UTC+1 in July (BST) -- also Llangollen's zone

describe("calculateOnwardTravelMinutes", () => {
  it("is zero when the flight already lands at the festival city", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocationId: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocationId: "Home",
          toLocationId: "Llangollen",
          fromZone: null,
          toZone: LONDON,
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
      ],
    });
    expect(result).toEqual({ status: "known", minutes: 0 });
  });

  // The whole point of the phase: Paris is an hour ahead of London in
  // July, so a naive clock-time subtraction (11:00 - 10:00 = 1 hour)
  // understates this westbound leg by that hour. Read in each
  // endpoint's own zone, it's really two.
  it("computes Paris 10:00 -> London 11:00 as two hours, not one", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocationId: "London",
      movements: [
        {
          sequence: 1,
          fromLocationId: "Home",
          toLocationId: "Paris",
          fromZone: null,
          toZone: PARIS,
          departDate: "2027-07-01",
          departTime: "06:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "10:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
        {
          sequence: 2,
          fromLocationId: "Paris",
          toLocationId: "London",
          fromZone: PARIS,
          toZone: LONDON,
          departDate: "2027-07-01",
          departTime: "10:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "11:00:00",
          flightOptionId: null,
        },
      ],
    });
    expect(result).toEqual({ status: "known", minutes: 120 });
  });

  // The reverse leg: London is an hour behind Paris, so the same naive
  // subtraction (11:00 - 10:00 = 1 hour) overstates it -- the safe
  // direction, but still wrong. Read correctly, departure and arrival
  // are the same instant.
  it("computes London 10:00 -> Paris 11:00 as zero hours, not one", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocationId: "Paris",
      movements: [
        {
          sequence: 1,
          fromLocationId: "Home",
          toLocationId: "London",
          fromZone: null,
          toZone: LONDON,
          departDate: "2027-07-01",
          departTime: "06:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "10:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
        {
          sequence: 2,
          fromLocationId: "London",
          toLocationId: "Paris",
          fromZone: LONDON,
          toZone: PARIS,
          departDate: "2027-07-01",
          departTime: "10:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "11:00:00",
          flightOptionId: null,
        },
      ],
    });
    expect(result).toEqual({ status: "known", minutes: 0 });
  });

  it("walks forward through onward legs to the festival stay, summing waiting and travel time", () => {
    // Paris (flight lands) -> London -> Llangollen, mirroring the
    // traveller's actual route in the phase discussion.
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocationId: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocationId: "Home",
          toLocationId: "Paris",
          fromZone: null,
          toZone: PARIS,
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
        {
          sequence: 2,
          fromLocationId: "Paris",
          toLocationId: "London",
          fromZone: PARIS,
          toZone: LONDON,
          departDate: "2027-07-01",
          departTime: "16:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "17:00:00",
          flightOptionId: null,
        },
        {
          sequence: 3,
          fromLocationId: "London",
          toLocationId: "Llangollen",
          fromZone: LONDON,
          toZone: LONDON,
          departDate: "2027-07-01",
          departTime: "18:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "22:00:00",
          flightOptionId: null,
        },
      ],
    });
    // Landing 14:00 Paris (12:00Z) -> arrives Llangollen 22:00 London
    // local (21:00Z) = 9 hours = 540 minutes. (A same-zone, naive
    // reading would have said 480 -- short by the hour Paris gains on
    // London, understating this westbound route.)
    expect(result).toEqual({ status: "known", minutes: 540 });
  });

  it("reports unknown, not a guess, when no festival-kind stay is recorded yet", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocationId: null,
      movements: [],
    });
    expect(result).toEqual({ status: "unknown", reason: "no festival-kind stay recorded to travel onward to" });
  });

  it("reports unknown when nothing in the scenario is linked to this flight option", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocationId: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocationId: "Home",
          toLocationId: "Paris",
          fromZone: null,
          toZone: PARIS,
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: null,
        },
      ],
    });
    expect(result.status).toBe("unknown");
  });

  it("reports unknown, not a wrong number, when a location on the route has no time zone recorded yet", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocationId: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocationId: "Home",
          toLocationId: "Paris",
          fromZone: null,
          toZone: null, // Paris hasn't had its zone recorded yet.
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
        {
          sequence: 2,
          fromLocationId: "Paris",
          toLocationId: "Llangollen",
          fromZone: null,
          toZone: LONDON,
          departDate: "2027-07-01",
          departTime: "18:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "22:00:00",
          flightOptionId: null,
        },
      ],
    });
    expect(result).toEqual({ status: "unknown", reason: "a location on this route has no time zone recorded yet" });
  });

  it("bounds the total by the day's limits, rather than giving up, when an onward leg has no time of day recorded", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocationId: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocationId: "Home",
          toLocationId: "Paris",
          fromZone: null,
          toZone: PARIS,
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
        {
          sequence: 2,
          fromLocationId: "Paris",
          toLocationId: "Llangollen",
          fromZone: PARIS,
          toZone: LONDON,
          departDate: "2027-07-01",
          departTime: null,
          arriveDate: "2027-07-01",
          arriveTime: null,
          flightOptionId: null,
        },
      ],
    });
    // Flight lands exactly at 14:00 Paris local (12:00Z). The onward
    // leg's own arrival, with no time recorded, is bounded between
    // 00:00 and 23:59 London local that same day (23:00Z the previous
    // day, to 22:59Z) -- so the total is bounded between -780 and 659
    // minutes, without assuming a journey time.
    expect(result).toEqual({ status: "bounded", minMinutes: -780, maxMinutes: 659 });
  });

  it("bounds the total using only the flight's own arrival and the destination leg's own arrival, ignoring an untimed leg in between", () => {
    // Paris (flight lands, known) -> London (untimed) -> Llangollen
    // (known) -- the London leg's own times telescope out of the total
    // algebraically, so a missing time there still leaves an exact
    // answer, not merely a bound.
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocationId: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocationId: "Home",
          toLocationId: "Paris",
          fromZone: null,
          toZone: PARIS,
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
        {
          sequence: 2,
          fromLocationId: "Paris",
          toLocationId: "London",
          fromZone: PARIS,
          toZone: LONDON,
          departDate: "2027-07-01",
          departTime: null,
          arriveDate: "2027-07-01",
          arriveTime: null,
          flightOptionId: null,
        },
        {
          sequence: 3,
          fromLocationId: "London",
          toLocationId: "Llangollen",
          fromZone: LONDON,
          toZone: LONDON,
          departDate: "2027-07-01",
          departTime: "18:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "22:00:00",
          flightOptionId: null,
        },
      ],
    });
    // Still bounded, not known: a "known" figure requires every leg's
    // own times (and zones) recorded, even where they'd cancel out
    // numerically -- half-timed data is a smell even when it happens to
    // be moot. But the bound itself is exact here since both endpoints
    // (14:00 Paris and 22:00 London) are known: 540-540.
    expect(result).toEqual({ status: "bounded", minMinutes: 540, maxMinutes: 540 });
  });

  it("reports unknown when the chain after the flight never reaches the festival stay", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocationId: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocationId: "Home",
          toLocationId: "Paris",
          fromZone: null,
          toZone: PARIS,
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
        {
          sequence: 2,
          fromLocationId: "Paris",
          toLocationId: "London",
          fromZone: PARIS,
          toZone: LONDON,
          departDate: "2027-07-01",
          departTime: "16:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "17:00:00",
          flightOptionId: null,
        },
      ],
    });
    expect(result.status).toBe("unknown");
  });
});
