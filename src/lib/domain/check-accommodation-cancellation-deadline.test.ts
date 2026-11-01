import { describe, expect, it } from "vitest";

import { checkAccommodationCancellationDeadline } from "./check-accommodation-cancellation-deadline";

describe("checkAccommodationCancellationDeadline", () => {
  it("returns unknown when no deadline is recorded", () => {
    const result = checkAccommodationCancellationDeadline({ cancellationDeadline: null, asOfDate: "2028-01-01" });
    expect(result.status).toBe("unknown");
  });

  it("passes with a plain reason when the deadline is comfortably in the future", () => {
    const result = checkAccommodationCancellationDeadline({
      cancellationDeadline: "2028-02-01",
      asOfDate: "2028-01-01",
    });
    expect(result.status).toBe("pass");
  });

  it("passes but flags imminence when the deadline is within the warning window", () => {
    const result = checkAccommodationCancellationDeadline({
      cancellationDeadline: "2028-01-03",
      asOfDate: "2028-01-01",
    });
    expect(result.status).toBe("pass");
    expect(result.reasons[0]).toMatch(/day/);
  });

  it("fails only once the deadline has actually passed, never for one still imminent", () => {
    const passed = checkAccommodationCancellationDeadline({
      cancellationDeadline: "2027-12-31",
      asOfDate: "2028-01-01",
    });
    expect(passed.status).toBe("fail");

    const imminent = checkAccommodationCancellationDeadline({
      cancellationDeadline: "2028-01-02",
      asOfDate: "2028-01-01",
    });
    expect(imminent.status).not.toBe("fail");
  });
});
