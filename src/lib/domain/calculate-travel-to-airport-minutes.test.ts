import { describe, expect, it } from "vitest";

import { calculateTravelToAirportMinutes } from "./calculate-travel-to-airport-minutes";
import { NAIVE_LOCAL_TIME_CAVEAT } from "./calculate-onward-travel-minutes";

const FLIGHT_OPTION_ID = "f0000000-0000-0000-0000-000000000001";

describe("calculateTravelToAirportMinutes", () => {
  it("is zero, with the caveat still stated, when the return flight departs from the festival city", () => {
    const result = calculateTravelToAirportMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "Llangollen",
          toLocation: "Home",
          departDate: "2027-07-10",
          departTime: "09:00:00",
          arriveDate: "2027-07-10",
          arriveTime: "15:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
      ],
    });
    expect(result).toEqual({ status: "known", minutes: 0, caveat: NAIVE_LOCAL_TIME_CAVEAT });
  });

  it("walks backward through the legs before the return flight, summing waiting and travel time", () => {
    // Llangollen -> London -> Paris (return flight departs), the
    // reverse of the onward-side fixture.
    const result = calculateTravelToAirportMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "Llangollen",
          toLocation: "London",
          departDate: "2027-07-10",
          departTime: "08:00:00",
          arriveDate: "2027-07-10",
          arriveTime: "09:00:00",
          flightOptionId: null,
        },
        {
          sequence: 2,
          fromLocation: "London",
          toLocation: "Paris",
          departDate: "2027-07-10",
          departTime: "10:00:00",
          arriveDate: "2027-07-10",
          arriveTime: "11:00:00",
          flightOptionId: null,
        },
        {
          sequence: 3,
          fromLocation: "Paris",
          toLocation: "Home",
          departDate: "2027-07-10",
          departTime: "14:00:00",
          arriveDate: "2027-07-10",
          arriveTime: "20:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
      ],
    });
    // Departs Paris 14:00 <- arrive Paris 11:00 (180 min wait) <- depart
    // London 10:00 (60 min travel) <- arrive London 09:00 (60 min wait)
    // <- depart Llangollen 08:00 (60 min travel) = 360 minutes.
    expect(result).toEqual({ status: "known", minutes: 360, caveat: NAIVE_LOCAL_TIME_CAVEAT });
  });

  it("reports unknown, not a guess, when no festival-kind stay is recorded yet", () => {
    const result = calculateTravelToAirportMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: null,
      movements: [],
    });
    expect(result).toEqual({ status: "unknown", reason: "no festival-kind stay recorded to travel from" });
  });

  it("reports unknown when nothing in the scenario is linked to this flight option", () => {
    const result = calculateTravelToAirportMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "Llangollen",
          toLocation: "Home",
          departDate: "2027-07-10",
          departTime: "09:00:00",
          arriveDate: "2027-07-10",
          arriveTime: "15:00:00",
          flightOptionId: null,
        },
      ],
    });
    expect(result.status).toBe("unknown");
  });

  it("bounds the total by the day's limits, rather than giving up, when the origin leg has no time of day recorded", () => {
    const result = calculateTravelToAirportMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "Llangollen",
          toLocation: "Paris",
          departDate: "2027-07-10",
          departTime: null,
          arriveDate: "2027-07-10",
          arriveTime: null,
          flightOptionId: null,
        },
        {
          sequence: 2,
          fromLocation: "Paris",
          toLocation: "Home",
          departDate: "2027-07-10",
          departTime: "14:00:00",
          arriveDate: "2027-07-10",
          arriveTime: "20:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
      ],
    });
    // Return flight departs exactly at 14:00. The origin leg's own
    // departure, with no time recorded, is bounded between 00:00 and
    // 23:59 that same day -- so the total is bounded between
    // (14:00-23:59) = -599 and (14:00-00:00) = 840 minutes, without
    // assuming a journey time.
    expect(result).toEqual({ status: "bounded", minMinutes: -599, maxMinutes: 840, caveat: NAIVE_LOCAL_TIME_CAVEAT });
  });

  it("bounds the total using only the return flight's own departure and the origin leg's own departure, ignoring an untimed leg in between", () => {
    // Llangollen (known) -> London (untimed) -> Paris (return flight
    // departs, known) -- the London leg's own times telescope out of
    // the total algebraically, so a missing time there still leaves an
    // exact bound, not a wide one.
    const result = calculateTravelToAirportMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "Llangollen",
          toLocation: "London",
          departDate: "2027-07-10",
          departTime: "08:00:00",
          arriveDate: "2027-07-10",
          arriveTime: "09:00:00",
          flightOptionId: null,
        },
        {
          sequence: 2,
          fromLocation: "London",
          toLocation: "Paris",
          departDate: "2027-07-10",
          departTime: null,
          arriveDate: "2027-07-10",
          arriveTime: null,
          flightOptionId: null,
        },
        {
          sequence: 3,
          fromLocation: "Paris",
          toLocation: "Home",
          departDate: "2027-07-10",
          departTime: "14:00:00",
          arriveDate: "2027-07-10",
          arriveTime: "20:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
      ],
    });
    // Still bounded, not known: a "known" figure requires every leg's
    // own times recorded, even where they'd cancel out numerically. But
    // the bound itself is exact here since both endpoints (08:00 and
    // 14:00) are known: 360-360.
    expect(result).toEqual({ status: "bounded", minMinutes: 360, maxMinutes: 360, caveat: NAIVE_LOCAL_TIME_CAVEAT });
  });

  it("reports unknown when the chain before the flight never starts from the festival stay", () => {
    const result = calculateTravelToAirportMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "London",
          toLocation: "Paris",
          departDate: "2027-07-10",
          departTime: "10:00:00",
          arriveDate: "2027-07-10",
          arriveTime: "11:00:00",
          flightOptionId: null,
        },
        {
          sequence: 2,
          fromLocation: "Paris",
          toLocation: "Home",
          departDate: "2027-07-10",
          departTime: "14:00:00",
          arriveDate: "2027-07-10",
          arriveTime: "20:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
      ],
    });
    expect(result.status).toBe("unknown");
  });
});
