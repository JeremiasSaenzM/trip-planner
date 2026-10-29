import { describe, expect, it } from "vitest";

import { createCompetitionInput, updateCompetitionInput } from "./competitions";

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

describe("createCompetitionInput", () => {
  it("accepts a valid competition", () => {
    expect(createCompetitionInput.safeParse(VALID).success).toBe(true);
  });

  it("accepts a competition with only a name -- host and dates not announced yet", () => {
    const result = createCompetitionInput.safeParse({ tripId: VALID.tripId, name: "Host not announced" });
    expect(result.success).toBe(true);
  });

  it("rejects a start date with no end date", () => {
    const result = createCompetitionInput.safeParse({ ...VALID, endDate: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects an end date with no start date", () => {
    const result = createCompetitionInput.safeParse({ ...VALID, startDate: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const result = createCompetitionInput.safeParse({ ...VALID, endDate: "2027-07-01" });
    expect(result.success).toBe(false);
  });

  it("rejects a confirmed dates state with no source", () => {
    const result = createCompetitionInput.safeParse({ ...VALID, datesState: "confirmed" });
    expect(result.success).toBe(false);
  });

  it("accepts a confirmed dates state with a source", () => {
    const result = createCompetitionInput.safeParse({ ...VALID, datesState: "confirmed", datesSourceId: SOURCE_ID });
    expect(result.success).toBe(true);
  });

  it("rejects confirmed dates with no dates, even with a source", () => {
    const result = createCompetitionInput.safeParse({
      tripId: VALID.tripId,
      name: "Confirmed nothing",
      datesState: "confirmed",
      datesSourceId: SOURCE_ID,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateCompetitionInput", () => {
  const UPDATE = {
    id: "33333333-3333-4333-8333-333333333333",
    name: VALID.name,
    startDate: VALID.startDate,
    endDate: VALID.endDate,
    datesState: "estimate",
    reason: "Dates announced",
  };

  it("accepts a valid edit", () => {
    expect(updateCompetitionInput.safeParse(UPDATE).success).toBe(true);
  });

  it("rejects a blank reason", () => {
    expect(updateCompetitionInput.safeParse({ ...UPDATE, reason: "  " }).success).toBe(false);
  });

  it("applies the same both-or-neither dates rule as create", () => {
    expect(updateCompetitionInput.safeParse({ ...UPDATE, endDate: undefined }).success).toBe(false);
  });

  it("accepts confirmed dates with a source", () => {
    const result = updateCompetitionInput.safeParse({ ...UPDATE, datesState: "confirmed", datesSourceId: SOURCE_ID });
    expect(result.success).toBe(true);
  });

  it("has no acceptance status field -- unknown keys are stripped, never written", () => {
    const result = updateCompetitionInput.safeParse({ ...UPDATE, acceptanceStatus: "accepted" });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("acceptanceStatus");
  });
});
