import { describe, expect, it } from "vitest";
import { checkUsCanadaStop, type FlightSegmentStopInput } from "./check-us-canada-stop";

function seg(
  direction: "outbound" | "return",
  segmentOrder: number,
  toCountry: string | null,
): FlightSegmentStopInput {
  return { direction, segmentOrder, toCountry };
}

describe("checkUsCanadaStop", () => {
  it("passes a clean route in both directions", () => {
    const result = checkUsCanadaStop([
      seg("outbound", 1, "QA"),
      seg("outbound", 2, "FR"),
      seg("return", 1, "QA"),
      seg("return", 2, "ES"),
    ]);
    expect(result.status).toBe("pass");
    expect(result.stopCountries).toEqual([]);
  });

  it("fails on an intermediate JFK (US) stop", () => {
    const result = checkUsCanadaStop([seg("outbound", 1, "US"), seg("outbound", 2, "FR")]);
    expect(result.status).toBe("fail");
    expect(result.stopCountries).toEqual(["US"]);
  });

  it("fails on an intermediate SJU (Puerto Rico) stop", () => {
    const result = checkUsCanadaStop([seg("outbound", 1, "PR"), seg("outbound", 2, "FR")]);
    expect(result.status).toBe("fail");
    expect(result.stopCountries).toEqual(["PR"]);
  });

  it("fails on a MIA (US) stop on the return leg, even with a clean outbound", () => {
    const result = checkUsCanadaStop([
      seg("outbound", 1, "FR"),
      seg("return", 1, "US"),
      seg("return", 2, "ES"),
    ]);
    expect(result.status).toBe("fail");
    expect(result.stopCountries).toEqual(["US"]);
  });

  it("fails on a YYZ (Canada) intermediate stop", () => {
    const result = checkUsCanadaStop([seg("outbound", 1, "CA"), seg("outbound", 2, "FR")]);
    expect(result.status).toBe("fail");
    expect(result.stopCountries).toEqual(["CA"]);
  });

  it("fails on GUM (Guam) and STT (US Virgin Islands) intermediate stops", () => {
    const result = checkUsCanadaStop([
      seg("outbound", 1, "GU"),
      seg("outbound", 2, "VI"),
      seg("outbound", 3, "FR"),
    ]);
    expect(result.status).toBe("fail");
    expect(result.stopCountries.sort()).toEqual(["GU", "VI"]);
  });

  it("passes a single-leg direct flight (no intermediate stops at all)", () => {
    const result = checkUsCanadaStop([seg("outbound", 1, "FR"), seg("return", 1, "ES")]);
    expect(result.status).toBe("pass");
  });

  it("does not count the final destination itself as a stop, even if it's the US", () => {
    const result = checkUsCanadaStop([seg("outbound", 1, "US")]);
    expect(result.status).toBe("pass");
  });

  it("returns unknown when an intermediate segment has no recorded country", () => {
    const result = checkUsCanadaStop([seg("outbound", 1, null), seg("outbound", 2, "FR")]);
    expect(result.status).toBe("unknown");
  });
});
