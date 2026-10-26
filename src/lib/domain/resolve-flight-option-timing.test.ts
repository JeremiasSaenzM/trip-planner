import { describe, expect, it } from "vitest";

import { resolveFlightOptionTiming } from "./resolve-flight-option-timing";

describe("resolveFlightOptionTiming", () => {
  it("takes the last outbound segment's arrival and the first return segment's departure", () => {
    const result = resolveFlightOptionTiming([
      { direction: "outbound", segmentOrder: 1, departAt: "2027-07-01T08:00:00Z", arriveAt: "2027-07-01T14:00:00Z" },
      { direction: "outbound", segmentOrder: 2, departAt: "2027-07-01T16:00:00Z", arriveAt: "2027-07-01T22:00:00Z" },
      { direction: "return", segmentOrder: 1, departAt: "2027-07-25T09:00:00Z", arriveAt: "2027-07-25T15:00:00Z" },
      { direction: "return", segmentOrder: 2, departAt: "2027-07-25T17:00:00Z", arriveAt: "2027-07-25T23:00:00Z" },
    ]);
    expect(result).toEqual({
      outboundArrivalAt: "2027-07-01T22:00:00Z",
      returnDepartureAt: "2027-07-25T09:00:00Z",
    });
  });

  it("is unaffected by the order segments are passed in", () => {
    const result = resolveFlightOptionTiming([
      { direction: "outbound", segmentOrder: 2, departAt: "2027-07-01T16:00:00Z", arriveAt: "2027-07-01T22:00:00Z" },
      { direction: "outbound", segmentOrder: 1, departAt: "2027-07-01T08:00:00Z", arriveAt: "2027-07-01T14:00:00Z" },
    ]);
    expect(result.outboundArrivalAt).toBe("2027-07-01T22:00:00Z");
  });

  it("is null on the return side for a one-way option", () => {
    const result = resolveFlightOptionTiming([
      { direction: "outbound", segmentOrder: 1, departAt: "2027-07-01T08:00:00Z", arriveAt: "2027-07-01T14:00:00Z" },
    ]);
    expect(result).toEqual({ outboundArrivalAt: "2027-07-01T14:00:00Z", returnDepartureAt: null });
  });

  it("is null on both sides with no segments entered yet", () => {
    expect(resolveFlightOptionTiming([])).toEqual({ outboundArrivalAt: null, returnDepartureAt: null });
  });
});
