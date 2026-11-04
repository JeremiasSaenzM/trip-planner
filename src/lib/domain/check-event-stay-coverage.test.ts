import { describe, expect, it } from "vitest";

import { checkEventStayCoverage } from "./check-event-stay-coverage";

describe("checkEventStayCoverage", () => {
  it("reports unknown when the event has no dates yet", () => {
    const result = checkEventStayCoverage({
      stays: [{ kind: "event", startDate: "2027-07-04", nights: 8 }],
      eventStartDate: null,
      eventEndDate: "2027-07-11",
    });
    expect(result).toEqual({ status: "unknown" });
  });

  it("passes when an event stay spans the night before through the final night", () => {
    const result = checkEventStayCoverage({
      stays: [{ kind: "event", startDate: "2027-07-04", nights: 8 }],
      eventStartDate: "2027-07-05",
      eventEndDate: "2027-07-11",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("flags the nights an event stay doesn't cover", () => {
    const result = checkEventStayCoverage({
      // Starts on the first event day itself, not the night before --
      // and ends two nights early.
      stays: [{ kind: "event", startDate: "2027-07-05", nights: 5 }],
      eventStartDate: "2027-07-05",
      eventEndDate: "2027-07-11",
    });
    expect(result).toEqual({
      status: "gap",
      uncoveredNights: ["2027-07-04", "2027-07-10", "2027-07-11"],
    });
  });

  it("ignores a non-event stay even if its dates would otherwise cover the gap", () => {
    const result = checkEventStayCoverage({
      stays: [{ kind: "independent", startDate: "2027-07-04", nights: 8 }],
      eventStartDate: "2027-07-05",
      eventEndDate: "2027-07-11",
    });
    expect(result.status).toBe("gap");
  });

  it("doesn't crash with no stays at all", () => {
    const result = checkEventStayCoverage({
      stays: [],
      eventStartDate: "2027-07-05",
      eventEndDate: "2027-07-05",
    });
    expect(result).toEqual({ status: "gap", uncoveredNights: ["2027-07-04", "2027-07-05"] });
  });
});
