import { describe, expect, it } from "vitest";
import { NAIVE_LOCAL_TIME_CAVEAT, type OnwardTravelResult } from "./calculate-onward-travel-minutes";
import { checkFestivalArrivalDeparture, type FestivalArrivalDepartureInput } from "./check-festival-arrival-departure";

function known(minutes: number): OnwardTravelResult {
  return { status: "known", minutes, caveat: NAIVE_LOCAL_TIME_CAVEAT };
}

function bounded(minMinutes: number, maxMinutes: number): OnwardTravelResult {
  return { status: "bounded", minMinutes, maxMinutes, caveat: NAIVE_LOCAL_TIME_CAVEAT };
}

function unknown(reason: string): OnwardTravelResult {
  return { status: "unknown", reason };
}

const base: FestivalArrivalDepartureInput = {
  outboundArrivalAt: "2027-07-04T20:00:00+02:00",
  onwardTravel: known(60),
  returnDepartureAt: "2027-07-12T10:00:00+02:00",
  travelToAirport: known(60),
  festivalStartDate: "2027-07-05",
  festivalEndDate: "2027-07-11",
  timezone: "Europe/Paris",
  datesInformationState: "confirmed",
};

describe("checkFestivalArrivalDeparture", () => {
  it("passes when arrival+onward-travel is comfortably before day 1 and departure is comfortably after the final day", () => {
    const result = checkFestivalArrivalDeparture(base);
    expect(result.status).toBe("pass");
    expect(result.provisional).toBe(false);
  });

  it("fails when arrival the evening before is pushed past midnight by onward travel", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      outboundArrivalAt: "2027-07-04T23:00:00+02:00",
      onwardTravel: known(90), // lands at destination 00:30 on July 5 -- already day 1
    });
    expect(result.status).toBe("fail");
  });

  it("passes when departure is exactly at the earliest allowed instant (boundary is inclusive)", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      travelToAirport: known(120),
      returnDepartureAt: "2027-07-12T02:00:00+02:00", // festival ends midnight July 12 + 120min
    });
    expect(result.status).toBe("pass");
  });

  it("fails when departure is one minute before the earliest allowed instant", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      travelToAirport: known(120),
      returnDepartureAt: "2027-07-12T01:59:00+02:00",
    });
    expect(result.status).toBe("fail");
  });

  it("returns unknown when onward travel time is genuinely unresolvable, not merely untimed", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      onwardTravel: unknown("no festival-kind stay recorded to travel onward to"),
    });
    expect(result.status).toBe("unknown");
  });

  it("returns unknown when travel-to-airport time is genuinely unresolvable, not merely untimed", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      travelToAirport: unknown("no festival-kind stay recorded to travel from"),
    });
    expect(result.status).toBe("unknown");
  });

  it("flags provisional when the festival dates are only an estimate, independent of pass/fail", () => {
    const result = checkFestivalArrivalDeparture({ ...base, datesInformationState: "estimate" });
    expect(result.status).toBe("pass");
    expect(result.provisional).toBe(true);
  });

  it("fails overall when arrival fails and departure is unknown -- a definite problem outranks a missing one", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      outboundArrivalAt: "2027-07-04T23:00:00+02:00",
      onwardTravel: known(90), // arrival fails
      travelToAirport: unknown("no movement in this scenario is linked to this flight option"), // departure unknown
    });
    expect(result.status).toBe("fail");
  });

  // Untimed movements still carry a date, which bounds the instant they
  // happened at even without a time of day: an untimed arrival is no
  // later than 23:59 that day, no earlier than 00:00; an untimed
  // departure the same. Three shapes of that bound, mirrored across both
  // legs: the pessimistic bound still settling it, the optimistic bound
  // already settling it the other way, and a bound wide enough to
  // straddle the threshold, where the missing time of day would actually
  // matter and unknown is the right answer.

  it("passes on the pessimistic bound alone when onward travel is untimed but the worst case is still comfortably early", () => {
    // Arrives 20:00 July 4; even the slowest recorded onward travel
    // (2h) lands at 22:00 July 4, hours before the festival starts.
    const result = checkFestivalArrivalDeparture({ ...base, onwardTravel: bounded(30, 120) });
    expect(result.status).toBe("pass");
    expect(result.reasons[0]).toMatch(/date.*alone/i);
    expect(result.reasons[0]).not.toMatch(/guess|assum/i);
  });

  it("fails on the optimistic bound alone when onward travel is untimed but even the best case is already too late", () => {
    // Arrives 23:00 July 4; even the fastest recorded onward travel
    // (90min) already lands at 00:30 July 5, into the festival.
    const result = checkFestivalArrivalDeparture({
      ...base,
      outboundArrivalAt: "2027-07-04T23:00:00+02:00",
      onwardTravel: bounded(90, 300),
    });
    expect(result.status).toBe("fail");
    expect(result.reasons[0]).toMatch(/date.*alone/i);
  });

  it("is genuinely unknown when the untimed onward-travel bound straddles the festival start", () => {
    // Arrives 22:00 July 4; bound of 60-180min spans from 23:00 July 4
    // (fine) to 01:00 July 5 (already the festival) -- the missing time
    // of day would decide this, so the dates alone can't.
    const result = checkFestivalArrivalDeparture({
      ...base,
      outboundArrivalAt: "2027-07-04T22:00:00+02:00",
      onwardTravel: bounded(60, 180),
    });
    expect(result.status).toBe("unknown");
    expect(result.reasons[0]).toMatch(/straddl/i);
  });

  it("says the figure rests on the recorded times, not merely dates, when an untimed intermediate leg still leaves a zero-width bound", () => {
    // minMinutes === maxMinutes means both endpoints that actually
    // determine the total were recorded times -- some OTHER, irrelevant
    // leg was the one left untimed. Claiming this rests "on the
    // recorded dates alone" would understate its actual basis.
    const result = checkFestivalArrivalDeparture({ ...base, onwardTravel: bounded(60, 60) });
    expect(result.status).toBe("pass");
    expect(result.reasons[0]).not.toMatch(/dates alone/i);
    expect(result.reasons[0]).toMatch(/recorded times/i);
  });

  it("passes on the pessimistic bound alone when travel-to-airport is untimed but even the slowest case leaves the departure comfortably clear", () => {
    // Festival ends midnight July 12; even the slowest recorded
    // travel-to-airport (3h) only requires departing by 03:00 July 12,
    // and the flight departs 25 July.
    const result = checkFestivalArrivalDeparture({
      ...base,
      returnDepartureAt: "2027-07-25T10:00:00+02:00",
      travelToAirport: bounded(30, 180),
    });
    expect(result.status).toBe("pass");
    expect(result.reasons[1]).toMatch(/date.*alone/i);
  });

  it("fails on the optimistic bound alone when travel-to-airport is untimed but even the quickest case already requires a later departure", () => {
    // Festival ends midnight July 12; even the quickest recorded
    // travel-to-airport (90min) requires departing by 01:30 July 12, and
    // the flight departs 01:00.
    const result = checkFestivalArrivalDeparture({
      ...base,
      returnDepartureAt: "2027-07-12T01:00:00+02:00",
      travelToAirport: bounded(90, 300),
    });
    expect(result.status).toBe("fail");
    expect(result.reasons[1]).toMatch(/date.*alone/i);
  });

  it("is genuinely unknown when the untimed travel-to-airport bound straddles the required departure", () => {
    // Festival ends midnight July 12; a 60-180min bound requires
    // departing somewhere between 01:00 and 03:00 July 12, and the
    // flight departs 02:00 -- squarely inside that range.
    const result = checkFestivalArrivalDeparture({
      ...base,
      returnDepartureAt: "2027-07-12T02:00:00+02:00",
      travelToAirport: bounded(60, 180),
    });
    expect(result.status).toBe("unknown");
    expect(result.reasons[1]).toMatch(/straddl/i);
  });
});
