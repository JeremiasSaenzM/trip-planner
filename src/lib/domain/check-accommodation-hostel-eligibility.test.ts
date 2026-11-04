import { describe, expect, it } from "vitest";

import { checkAccommodationHostelEligibility } from "./check-accommodation-hostel-eligibility";

describe("checkAccommodationHostelEligibility", () => {
  it("fails a hostel attached to the event stay", () => {
    const result = checkAccommodationHostelEligibility({ isHostel: true, stayKind: "event" });
    expect(result.status).toBe("fail");
  });

  it("passes the same hostel on an independent stay", () => {
    const result = checkAccommodationHostelEligibility({ isHostel: true, stayKind: "independent" });
    expect(result.status).toBe("pass");
  });

  it("passes a non-hostel on the event stay", () => {
    const result = checkAccommodationHostelEligibility({ isHostel: false, stayKind: "event" });
    expect(result.status).toBe("pass");
  });
});
