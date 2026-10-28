import { describe, expect, it } from "vitest";
import { NAIVE_LOCAL_TIME_CAVEAT, type OnwardTravelResult } from "./calculate-onward-travel-minutes";
import { checkFestivalArrivalDeparture, type FestivalArrivalDepartureInput } from "./check-festival-arrival-departure";
import type { FestivalDepartureResult } from "./find-festival-departure";

function known(minutes: number): OnwardTravelResult {
  return { status: "known", minutes, caveat: NAIVE_LOCAL_TIME_CAVEAT };
}

function bounded(minMinutes: number, maxMinutes: number): OnwardTravelResult {
  return { status: "bounded", minMinutes, maxMinutes, caveat: NAIVE_LOCAL_TIME_CAVEAT };
}

function unknown(reason: string): OnwardTravelResult {
  return { status: "unknown", reason };
}

function departs(departsAt: string): FestivalDepartureResult {
  return { status: "known", departsAt };
}

function departsBounded(earliestDepartsAt: string, latestDepartsAt: string): FestivalDepartureResult {
  return { status: "bounded", earliestDepartsAt, latestDepartsAt };
}

function departureUnknown(reason: string): FestivalDepartureResult {
  return { status: "unknown", reason };
}

const base: FestivalArrivalDepartureInput = {
  outboundArrivalAt: "2027-07-04T20:00:00+02:00",
  onwardTravel: known(60),
  // Festival ends midnight July 12 (Europe/Paris) -- this is well clear
  // of it, with free time in between, same shape as the real bug: this
  // check only cares that it's after, not how long after.
  festivalDeparture: departs("2027-07-25T10:00:00+02:00"),
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
      festivalDeparture: departs("2027-07-12T00:00:00+02:00"), // the instant the festival ends
    });
    expect(result.status).toBe("pass");
  });

  it("fails when departure is one minute before the earliest allowed instant", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      festivalDeparture: departs("2027-07-11T23:59:00+02:00"),
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

  it("returns unknown when festival departure is genuinely unresolvable, not merely untimed", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      festivalDeparture: departureUnknown("the movement chain never leaves the festival stay's location"),
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
      festivalDeparture: departureUnknown("the movement chain never leaves the festival stay's location"),
    });
    expect(result.status).toBe("fail");
  });

  // Untimed movements still carry a date, which bounds the instant they
  // happened at even without a time of day: an untimed arrival is no
  // later than 23:59 that day, no earlier than 00:00; an untimed
  // departure the same. Three shapes of that bound: the pessimistic
  // bound still settling it, the optimistic bound already settling it
  // the other way, and a bound wide enough to straddle the threshold,
  // where the missing time of day would actually matter and unknown is
  // the right answer.

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

  // findFestivalDeparture only ever bounds a single untimed movement's
  // own calendar date (00:00 to 23:59), and festivalEnds is always a
  // midnight -- so in practice that bound never straddles a midnight
  // (it either starts exactly at or after it, or ends entirely before
  // it). The two decisive shapes are tested against that real bound;
  // the straddling branch is tested directly against a synthetic one,
  // to prove checkFestivalArrivalDeparture's own logic is still correct
  // if that ever stops being true (e.g. a future bound that isn't a
  // whole calendar day).

  it("passes on the pessimistic bound alone when the festival departure is untimed but unambiguously after the final day", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      festivalDeparture: departsBounded("2027-07-13T00:00:00+02:00", "2027-07-13T23:59:00+02:00"),
    });
    expect(result.status).toBe("pass");
    expect(result.reasons[1]).toMatch(/date.*alone/i);
  });

  it("fails on the optimistic bound alone when the festival departure is untimed but unambiguously before the final day ends", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      festivalDeparture: departsBounded("2027-07-10T00:00:00+02:00", "2027-07-10T23:59:00+02:00"),
    });
    expect(result.status).toBe("fail");
    expect(result.reasons[1]).toMatch(/date.*alone/i);
  });

  it("is genuinely unknown when a (synthetic) festival-departure bound straddles the end of the final festival day", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      festivalDeparture: departsBounded("2027-07-11T20:00:00+02:00", "2027-07-12T04:00:00+02:00"),
    });
    expect(result.status).toBe("unknown");
    expect(result.reasons[1]).toMatch(/straddl/i);
  });

  // The naive-local-time simplification was accepted on condition that
  // its limitation stay stated, not merely computed. onwardTravel is
  // the only remaining source of it: festivalDeparture reads a single
  // movement's own local clock as the festival's own zone, which is
  // what it actually means, not an approximation.

  it("carries the naive-local-time caveat through from onward travel when it resolved", () => {
    const result = checkFestivalArrivalDeparture(base);
    expect(result.caveats).toEqual([NAIVE_LOCAL_TIME_CAVEAT]);
  });

  it("carries no caveat when onward travel is unknown, regardless of the festival departure", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      onwardTravel: unknown("no festival-kind stay recorded to travel onward to"),
    });
    expect(result.caveats).toEqual([]);
  });
});
