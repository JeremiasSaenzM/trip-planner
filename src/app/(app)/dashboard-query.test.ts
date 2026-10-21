import { describe, expect, it } from "vitest";

import { dashboardQuery, parseBasis } from "./dashboard-query";

describe("dashboardQuery", () => {
  it("carries scenario and basis", () => {
    expect(dashboardQuery(new URLSearchParams("scenario=abc&basis=conservative"))).toBe(
      "?scenario=abc&basis=conservative",
    );
  });

  it("carries basis=minimum like the other two", () => {
    expect(dashboardQuery(new URLSearchParams("scenario=abc&basis=minimum"))).toBe("?scenario=abc&basis=minimum");
  });

  it("drops every other key", () => {
    expect(dashboardQuery(new URLSearchParams("scenario=abc&edit=1"))).toBe("?scenario=abc");
  });

  it("returns an empty string when there's nothing to carry", () => {
    expect(dashboardQuery(new URLSearchParams("edit=1"))).toBe("");
    expect(dashboardQuery(new URLSearchParams(""))).toBe("");
  });
});

describe("parseBasis", () => {
  it("accepts each of the three bases", () => {
    expect(parseBasis("minimum")).toBe("minimum");
    expect(parseBasis("target")).toBe("target");
    expect(parseBasis("conservative")).toBe("conservative");
  });

  it("falls back to target -- the default -- for anything else", () => {
    expect(parseBasis(undefined)).toBe("target");
    expect(parseBasis("")).toBe("target");
    expect(parseBasis("Minimum")).toBe("target");
    expect(parseBasis("min")).toBe("target");
    expect(parseBasis(["minimum"])).toBe("target");
  });
});
