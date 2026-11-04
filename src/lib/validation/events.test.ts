import { describe, expect, it } from "vitest";

import { createEventInput, updateEventInput } from "./events";

const VALID = {
  tripId: "11111111-1111-4111-8111-111111111111",
  name: "Thornmere International Choir Festival",
  city: "Thornmere",
  country: "United Kingdom",
  startDate: "2027-07-06",
  endDate: "2027-07-11",
  timezone: "Europe/London",
};

const SOURCE_ID = "22222222-2222-4222-8222-222222222222";

describe("createEventInput", () => {
  it("accepts a valid event", () => {
    expect(createEventInput.safeParse(VALID).success).toBe(true);
  });

  it("accepts an event with only a name -- host and dates not announced yet", () => {
    const result = createEventInput.safeParse({ tripId: VALID.tripId, name: "Host not announced" });
    expect(result.success).toBe(true);
  });

  it("rejects a start date with no end date", () => {
    const result = createEventInput.safeParse({ ...VALID, endDate: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects an end date with no start date", () => {
    const result = createEventInput.safeParse({ ...VALID, startDate: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const result = createEventInput.safeParse({ ...VALID, endDate: "2027-07-01" });
    expect(result.success).toBe(false);
  });

  it("rejects a confirmed dates state with no source", () => {
    const result = createEventInput.safeParse({ ...VALID, datesState: "confirmed" });
    expect(result.success).toBe(false);
  });

  it("accepts a confirmed dates state with a source", () => {
    const result = createEventInput.safeParse({ ...VALID, datesState: "confirmed", datesSourceId: SOURCE_ID });
    expect(result.success).toBe(true);
  });

  it("rejects confirmed dates with no dates, even with a source", () => {
    const result = createEventInput.safeParse({
      tripId: VALID.tripId,
      name: "Confirmed nothing",
      datesState: "confirmed",
      datesSourceId: SOURCE_ID,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateEventInput", () => {
  const UPDATE = {
    id: "33333333-3333-4333-8333-333333333333",
    name: VALID.name,
    startDate: VALID.startDate,
    endDate: VALID.endDate,
    datesState: "estimate",
    reason: "Dates announced",
  };

  it("accepts a valid edit", () => {
    expect(updateEventInput.safeParse(UPDATE).success).toBe(true);
  });

  it("rejects a blank reason", () => {
    expect(updateEventInput.safeParse({ ...UPDATE, reason: "  " }).success).toBe(false);
  });

  it("applies the same both-or-neither dates rule as create", () => {
    expect(updateEventInput.safeParse({ ...UPDATE, endDate: undefined }).success).toBe(false);
  });

  it("accepts confirmed dates with a source", () => {
    const result = updateEventInput.safeParse({ ...UPDATE, datesState: "confirmed", datesSourceId: SOURCE_ID });
    expect(result.success).toBe(true);
  });

  it("has no acceptance status field -- unknown keys are stripped, never written", () => {
    const result = updateEventInput.safeParse({ ...UPDATE, acceptanceStatus: "accepted" });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("acceptanceStatus");
  });
});
