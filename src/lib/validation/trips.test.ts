import { describe, expect, it } from "vitest";

import { createTripInput, updateTripTravelWindowInput } from "./trips";

describe("createTripInput", () => {
  it("accepts a named trip", () => {
    expect(createTripInput.safeParse({ name: "Thornmere 2029" }).success).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(createTripInput.safeParse({ name: "  " }).success).toBe(false);
  });
});

describe("updateTripTravelWindowInput", () => {
  const VALID = {
    tripId: "11111111-1111-4111-8111-111111111111",
    departureDate: "2028-07-02",
    returnDate: "2028-07-25",
    travelDatesState: "estimate",
    reason: "Routing via Paris",
  };
  const SOURCE_ID = "22222222-2222-4222-8222-222222222222";

  it("accepts a full window", () => {
    expect(updateTripTravelWindowInput.safeParse(VALID).success).toBe(true);
  });

  it("accepts a departure date alone while it isn't confirmed", () => {
    expect(updateTripTravelWindowInput.safeParse({ ...VALID, returnDate: undefined }).success).toBe(true);
  });

  it("accepts clearing both dates", () => {
    const result = updateTripTravelWindowInput.safeParse({
      ...VALID,
      departureDate: undefined,
      returnDate: undefined,
      travelDatesState: "pending",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a return before the departure", () => {
    expect(updateTripTravelWindowInput.safeParse({ ...VALID, returnDate: "2028-07-01" }).success).toBe(false);
  });

  it("rejects confirmed dates with no source", () => {
    expect(updateTripTravelWindowInput.safeParse({ ...VALID, travelDatesState: "confirmed" }).success).toBe(false);
  });

  it("rejects confirmed dates missing the return date, even with a source", () => {
    const result = updateTripTravelWindowInput.safeParse({
      ...VALID,
      returnDate: undefined,
      travelDatesState: "confirmed",
      travelDatesSourceId: SOURCE_ID,
    });
    expect(result.success).toBe(false);
  });

  it("accepts confirmed dates with both dates and a source", () => {
    const result = updateTripTravelWindowInput.safeParse({
      ...VALID,
      travelDatesState: "confirmed",
      travelDatesSourceId: SOURCE_ID,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank reason", () => {
    expect(updateTripTravelWindowInput.safeParse({ ...VALID, reason: "" }).success).toBe(false);
  });
});
