import { describe, expect, it } from "vitest";

import { checkAccommodationNightsMatchStay } from "./check-accommodation-nights-match-stay";

describe("checkAccommodationNightsMatchStay", () => {
  it("passes when the option's nights match the stay's", () => {
    const result = checkAccommodationNightsMatchStay({ optionNights: 12, stayNights: 12 });
    expect(result.status).toBe("pass");
  });

  it("fails on a thirteen-night quote against a twelve-night stay", () => {
    const result = checkAccommodationNightsMatchStay({ optionNights: 13, stayNights: 12 });
    expect(result.status).toBe("fail");
    expect(result.reasons[0]).toContain("13");
    expect(result.reasons[0]).toContain("12");
  });
});
