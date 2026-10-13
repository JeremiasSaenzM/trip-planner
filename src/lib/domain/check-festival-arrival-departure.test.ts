import { describe, expect, it } from "vitest";
import { checkFestivalArrivalDeparture, type FestivalArrivalDepartureInput } from "./check-festival-arrival-departure";

const base: FestivalArrivalDepartureInput = {
  outboundArrivalAt: "2027-07-04T20:00:00+02:00",
  onwardTravelMinutes: 60,
  returnDepartureAt: "2027-07-12T10:00:00+02:00",
  travelToAirportMinutes: 60,
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
      onwardTravelMinutes: 90, // lands at destination 00:30 on July 5 -- already day 1
    });
    expect(result.status).toBe("fail");
  });

  it("passes when departure is exactly at the earliest allowed instant (boundary is inclusive)", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      travelToAirportMinutes: 120,
      returnDepartureAt: "2027-07-12T02:00:00+02:00", // festival ends midnight July 12 + 120min
    });
    expect(result.status).toBe("pass");
  });

  it("fails when departure is one minute before the earliest allowed instant", () => {
    const result = checkFestivalArrivalDeparture({
      ...base,
      travelToAirportMinutes: 120,
      returnDepartureAt: "2027-07-12T01:59:00+02:00",
    });
    expect(result.status).toBe("fail");
  });

  it("returns unknown when onward travel time is missing", () => {
    const result = checkFestivalArrivalDeparture({ ...base, onwardTravelMinutes: null });
    expect(result.status).toBe("unknown");
  });

  it("returns unknown when travel-to-airport time is missing", () => {
    const result = checkFestivalArrivalDeparture({ ...base, travelToAirportMinutes: null });
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
      onwardTravelMinutes: 90, // arrival fails
      travelToAirportMinutes: null, // departure unknown
    });
    expect(result.status).toBe("fail");
  });
});
