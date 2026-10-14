import { Settings } from "luxon";
import { afterEach, describe, expect, it } from "vitest";

import { formatDate } from "./format";

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
