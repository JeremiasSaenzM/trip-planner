import { describe, expect, it } from "vitest";

import { createCompetitionInput } from "./competitions";

const VALID = {
  tripId: "11111111-1111-4111-8111-111111111111",
  name: "Llangollen International Musical Eisteddfod",
  city: "Llangollen",
  country: "United Kingdom",
  startDate: "2027-07-06",
  endDate: "2027-07-11",
  timezone: "Europe/London",
};

describe("createCompetitionInput", () => {
  it("accepts a valid competition", () => {
    expect(createCompetitionInput.safeParse(VALID).success).toBe(true);
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
    const result = createCompetitionInput.safeParse({
      ...VALID,
      datesState: "confirmed",
      datesSourceId: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.success).toBe(true);
  });
});
