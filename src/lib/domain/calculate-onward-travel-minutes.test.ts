import { describe, expect, it } from "vitest";

import { calculateOnwardTravelMinutes, NAIVE_LOCAL_TIME_CAVEAT } from "./calculate-onward-travel-minutes";

const FLIGHT_OPTION_ID = "f0000000-0000-0000-0000-000000000001";

describe("calculateOnwardTravelMinutes", () => {
  it("is zero, with the caveat still stated, when the flight already lands at the festival city", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "Home",
          toLocation: "Llangollen",
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
      ],
    });
    expect(result).toEqual({ status: "known", minutes: 0, caveat: NAIVE_LOCAL_TIME_CAVEAT });
  });

  it("walks forward through onward legs to the festival stay, summing waiting and travel time", () => {
    // Paris (flight lands) -> London -> Llangollen, mirroring the
    // traveller's actual route in the phase discussion.
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "Home",
          toLocation: "Paris",
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
        {
          sequence: 2,
          fromLocation: "Paris",
          toLocation: "London",
          departDate: "2027-07-01",
          departTime: "16:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "17:00:00",
          flightOptionId: null,
        },
        {
          sequence: 3,
          fromLocation: "London",
          toLocation: "Llangollen",
          departDate: "2027-07-01",
          departTime: "18:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "22:00:00",
          flightOptionId: null,
        },
      ],
    });
    // Landing 14:00 -> depart London leg 16:00 (120 min wait) -> arrive
    // London 17:00 (60 min travel) -> depart 18:00 (60 min wait) ->
    // arrive Llangollen 22:00 (240 min travel) = 480 minutes.
    expect(result).toEqual({ status: "known", minutes: 480, caveat: NAIVE_LOCAL_TIME_CAVEAT });
  });

  it("reports unknown, not a guess, when no festival-kind stay is recorded yet", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: null,
      movements: [],
    });
    expect(result).toEqual({ status: "unknown", reason: "no festival-kind stay recorded to travel onward to" });
  });

  it("reports unknown when nothing in the scenario is linked to this flight option", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "Home",
          toLocation: "Paris",
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

  it("bounds the total by the day's limits, rather than giving up, when an onward leg has no time of day recorded", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "Home",
          toLocation: "Paris",
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
        {
          sequence: 2,
          fromLocation: "Paris",
          toLocation: "Llangollen",
          departDate: "2027-07-01",
          departTime: null,
          arriveDate: "2027-07-01",
          arriveTime: null,
          flightOptionId: null,
        },
      ],
    });
    // Flight lands exactly at 14:00. The onward leg's own arrival, with
    // no time recorded, is bounded between 00:00 and 23:59 that same
    // day -- so the total is bounded between (00:00-14:00) = -840 and
    // (23:59-14:00) = 599 minutes, without assuming a journey time.
    expect(result).toEqual({ status: "bounded", minMinutes: -840, maxMinutes: 599, caveat: NAIVE_LOCAL_TIME_CAVEAT });
  });

  it("bounds the total using only the flight's own arrival and the destination leg's own arrival, ignoring an untimed leg in between", () => {
    // Paris (flight lands, known) -> London (untimed) -> Llangollen
    // (known) -- the London leg's own times telescope out of the total
    // algebraically, so a missing time there still leaves an exact
    // answer, not merely a bound.
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "Home",
          toLocation: "Paris",
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
        {
          sequence: 2,
          fromLocation: "Paris",
          toLocation: "London",
          departDate: "2027-07-01",
          departTime: null,
          arriveDate: "2027-07-01",
          arriveTime: null,
          flightOptionId: null,
        },
        {
          sequence: 3,
          fromLocation: "London",
          toLocation: "Llangollen",
          departDate: "2027-07-01",
          departTime: "18:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "22:00:00",
          flightOptionId: null,
        },
      ],
    });
    // Still bounded, not known: a "known" figure requires every leg's
    // own times recorded, even where they'd cancel out numerically --
    // half-timed data is a smell even when it happens to be moot. But
    // the bound itself is exact here since both endpoints (14:00 and
    // 22:00) are known: 480-480.
    expect(result).toEqual({ status: "bounded", minMinutes: 480, maxMinutes: 480, caveat: NAIVE_LOCAL_TIME_CAVEAT });
  });

  it("reports unknown when the chain after the flight never reaches the festival stay", () => {
    const result = calculateOnwardTravelMinutes({
      flightOptionId: FLIGHT_OPTION_ID,
      festivalStayLocation: "Llangollen",
      movements: [
        {
          sequence: 1,
          fromLocation: "Home",
          toLocation: "Paris",
          departDate: "2027-07-01",
          departTime: "08:00:00",
          arriveDate: "2027-07-01",
          arriveTime: "14:00:00",
          flightOptionId: FLIGHT_OPTION_ID,
        },
        {
          sequence: 2,
          fromLocation: "Paris",
          toLocation: "London",
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
