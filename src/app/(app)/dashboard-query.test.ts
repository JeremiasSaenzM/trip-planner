import { describe, expect, it } from "vitest";

import { dashboardQuery } from "./dashboard-query";

describe("dashboardQuery", () => {
  it("carries scenario and basis", () => {
    expect(dashboardQuery(new URLSearchParams("scenario=abc&basis=conservative"))).toBe(
      "?scenario=abc&basis=conservative",
    );
  });

  it("drops every other key", () => {
    expect(dashboardQuery(new URLSearchParams("scenario=abc&edit=1"))).toBe("?scenario=abc");
  });

  it("returns an empty string when there's nothing to carry", () => {
    expect(dashboardQuery(new URLSearchParams("edit=1"))).toBe("");
    expect(dashboardQuery(new URLSearchParams(""))).toBe("");
  });
});
