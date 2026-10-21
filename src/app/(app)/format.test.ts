import { Settings } from "luxon";
import { afterEach, describe, expect, it } from "vitest";

import { formatAmountCompact, formatDate } from "./format";

describe("formatDate", () => {
  afterEach(() => {
    Settings.defaultZone = "system";
  });

  it("formats a calendar date the same no matter the ambient time zone", () => {
    // America/Guatemala is UTC-6 with no DST -- a date parsed as UTC and
    // then formatted in the ambient (local) zone would print one day
    // earlier here. formatDate must not do that.
    Settings.defaultZone = "America/Guatemala";
    expect(formatDate("2027-05-01")).toBe("May 1, 2027");
  });

  it("still formats correctly in UTC itself", () => {
    Settings.defaultZone = "utc";
    expect(formatDate("2027-05-01")).toBe("May 1, 2027");
  });

  it("still formats correctly in a time zone ahead of UTC", () => {
    Settings.defaultZone = "Asia/Tokyo"; // UTC+9
    expect(formatDate("2027-05-01")).toBe("May 1, 2027");
  });
});

describe("formatAmountCompact", () => {
  it("drops .00 from a whole amount", () => {
    expect(formatAmountCompact(1005, "USD")).toBe("$1,005");
    expect(formatAmountCompact(95, "EUR")).toBe("€95");
  });

  it("keeps a real fraction", () => {
    expect(formatAmountCompact(96.5, "GBP")).toBe("£96.50");
  });
});
