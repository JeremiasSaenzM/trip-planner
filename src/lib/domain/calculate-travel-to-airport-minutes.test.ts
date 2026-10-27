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

  it("reports unknown when a leg before the return flight has no recorded time of day", () => {
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
    expect(result).toEqual({ status: "unknown", reason: "movement #1 has no recorded time of day" });
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
