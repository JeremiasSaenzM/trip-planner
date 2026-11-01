import { describe, expect, it } from "vitest";

import { checkAccommodationHostelEligibility } from "./check-accommodation-hostel-eligibility";

describe("checkAccommodationHostelEligibility", () => {
  it("fails a hostel attached to the festival stay", () => {
    const result = checkAccommodationHostelEligibility({ isHostel: true, stayKind: "festival" });
    expect(result.status).toBe("fail");
  });

  it("passes the same hostel on an independent stay", () => {
    const result = checkAccommodationHostelEligibility({ isHostel: true, stayKind: "independent" });
    expect(result.status).toBe("pass");
  });

  it("passes a non-hostel on the festival stay", () => {
    const result = checkAccommodationHostelEligibility({ isHostel: false, stayKind: "festival" });
    expect(result.status).toBe("pass");
  });
});
