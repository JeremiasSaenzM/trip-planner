import { describe, expect, it } from "vitest";

import { dashboardHref, dashboardQuery, parseBasis } from "./dashboard-query";
import { parseSavingsView, SAVINGS_VIEWS } from "./savings-view";

describe("dashboardQuery", () => {
  it("carries scenario and basis", () => {
    expect(dashboardQuery(new URLSearchParams("scenario=abc&basis=conservative"))).toBe(
      "?scenario=abc&basis=conservative",
    );
  });

  it("carries trip, same as scenario and basis", () => {
    expect(dashboardQuery(new URLSearchParams("trip=xyz&scenario=abc&basis=conservative"))).toBe(
      "?trip=xyz&scenario=abc&basis=conservative",
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

describe("dashboardQuery and the savings view", () => {
  it("carries savings= across a nav click, like basis=", () => {
    expect(dashboardQuery(new URLSearchParams("scenario=abc&basis=target&savings=running-total"))).toBe(
      "?scenario=abc&basis=target&savings=running-total",
    );
  });
});

describe("dashboardHref", () => {
  it("builds a link carrying the whole selection", () => {
    expect(
      dashboardHref("/scenario", { trip: "t", scenario: "s", basis: "conservative", savings: "running-total" }),
    ).toBe("/scenario?trip=t&scenario=s&basis=conservative&savings=running-total");
  });

  it("leaves the default savings view off the link", () => {
    expect(dashboardHref("/", { trip: "t", scenario: "s", basis: "target", savings: "by-deadline" })).toBe(
      "/?trip=t&scenario=s&basis=target",
    );
  });

  it("whatever it carries, dashboardQuery carries on", () => {
    const href = dashboardHref("/", { trip: "t", scenario: "s", basis: "minimum", savings: "running-total" });
    const query = new URL(href, "http://x").searchParams;
    expect(`/${dashboardQuery(query)}`).toBe(href);
  });
});

describe("parseSavingsView", () => {
  it("accepts each view and falls back to By deadline for anything else", () => {
    for (const view of SAVINGS_VIEWS) expect(parseSavingsView(view)).toBe(view);
    expect(parseSavingsView(undefined)).toBe("by-deadline");
    expect(parseSavingsView("pots")).toBe("by-deadline");
  });
});
