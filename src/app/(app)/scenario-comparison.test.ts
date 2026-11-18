import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import * as fixtures from "@/lib/data/fixtures";
import { BASES } from "@/lib/domain/types";

import { buildSavingsScheduleData } from "./charts";
import { buildComparisonChartRows, buildPotComparisonRows } from "./scenario-comparison-chart";
import { buildScenarioComparison, buildScenarioSavings, type ScenarioComparisonLine } from "./scenario-savings";
import { sortScenarios } from "./scenario-order";

// The demo fixtures, the same data demo mode renders: one trip, three
// scenarios -- two inheriting the trip's (unset) window, one with its
// own -- so the lines genuinely differ.
const AS_OF = "2026-11-18";
const trip = fixtures.trips[0];
const tripScenarios = sortScenarios(fixtures.scenarios.filter((s) => s.tripId === trip.id));

const shared = {
  trip,
  events: fixtures.events,
  budgetLines: fixtures.budgetLines,
  payments: fixtures.payments,
  savingsEntries: fixtures.savingsEntries,
  rates: fixtures.fxRates,
  asOfDate: AS_OF,
};

function comparisonWhileViewing(viewedScenarioId: string, basis: (typeof BASES)[number]): ScenarioComparisonLine[] {
  return buildScenarioComparison({
    ...shared,
    scenarios: tripScenarios,
    viewedScenarioId,
    movements: fixtures.movements,
    basis,
  });
}

/** What the existing savings schedule chart plots for this scenario,
 * when it's the one being viewed -- the "money needed by this date" line. */
function savingsViewLine(scenarioId: string, basis: (typeof BASES)[number]) {
  const scenario = tripScenarios.find((s) => s.id === scenarioId)!;
  const plan = buildScenarioSavings({ ...shared, scenario, basis });
  if (plan.savings === null || plan.obligationsResult.status !== "ready") return [];
  return buildSavingsScheduleData({
    schedule: plan.savings.schedule,
    obligations: plan.obligationsResult.obligations,
    availableUsd: plan.obligationsResult.availableUsd,
    bindingRequirementUsd: plan.savings.bindingRequirement[basis],
    asOfDate: AS_OF,
    basis,
    departureSaveBy: plan.obligationsResult.departureSaveBy,
  }).map((point) => ({ timestamp: point.timestamp, usd: point.cumulativeRequired }));
}

function comparisonLine(line: ScenarioComparisonLine) {
  return line.points.map((point) => ({
    timestamp: DateTime.fromISO(point.date, { zone: "utc" }).toMillis(),
    usd: point.cumulativeUsd,
  }));
}

describe("buildScenarioComparison", () => {
  it("has real lines to compare in the fixtures, so the identity test below isn't vacuous", () => {
    const drawn = comparisonWhileViewing(tripScenarios[0].id, "target").filter((line) => line.points.length > 0);
    expect(drawn.length).toBeGreaterThanOrEqual(2);
  });

  // The trap this chart exists next to: three lines computed three ways
  // is three chances to disagree inside one picture. Whichever scenario
  // the page is on, and at every basis, each line must be exactly what
  // the savings schedule chart draws for that scenario when it's the one
  // being viewed.
  for (const basis of BASES) {
    it(`draws every scenario's line exactly as its own savings view does (${basis})`, () => {
      for (const viewed of tripScenarios) {
        const lines = comparisonWhileViewing(viewed.id, basis);
        expect(lines.map((line) => line.scenarioId)).toEqual(tripScenarios.map((s) => s.id));
        for (const line of lines) {
          expect(comparisonLine(line)).toEqual(savingsViewLine(line.scenarioId, basis));
        }
      }
    });
  }

  it("has real pots to compare in the fixtures, so the pot identity test below isn't vacuous", () => {
    const withPots = comparisonWhileViewing(tripScenarios[0].id, "target").filter((line) => line.pots.length > 0);
    expect(withPots.length).toBeGreaterThanOrEqual(2);
  });

  // Same trap, for the pots: each scenario's bars must be exactly the
  // pots its own savings views show when it's the one being viewed --
  // the "When money is needed" list (pots) and the one-pot-per-payment
  // chart (parallelPlan.pots) -- whichever scenario the page is on, at
  // every basis.
  for (const basis of BASES) {
    it(`gives every scenario exactly the pots its own savings views show (${basis})`, () => {
      for (const viewed of tripScenarios) {
        for (const line of comparisonWhileViewing(viewed.id, basis)) {
          const scenario = tripScenarios.find((s) => s.id === line.scenarioId)!;
          const plan = buildScenarioSavings({ ...shared, scenario, basis });
          const potList = (plan.pots ?? []).map((pot) => ({ dueDate: pot.dueDate, amountUsd: pot.amountUsd }));
          const potChart = (plan.parallelPlan?.pots ?? []).map((pot) => ({
            dueDate: pot.dueDate,
            amountUsd: pot.amountUsd,
          }));
          expect(line.pots).toEqual(potList);
          expect(line.pots).toEqual(potChart);
        }
      }
    });
  }

  it("emphasises only the scenario being viewed", () => {
    const viewed = tripScenarios[1].id;
    const lines = comparisonWhileViewing(viewed, "target");
    expect(lines.filter((line) => line.isViewed).map((line) => line.scenarioId)).toEqual([viewed]);
  });

  it("labels each line with its resolved travel window: its own when set, else the trip's", () => {
    const lines = comparisonWhileViewing(tripScenarios[0].id, "target");
    for (const line of lines) {
      const scenario = tripScenarios.find((s) => s.id === line.scenarioId)!;
      const expected = scenario.departureDate !== null ? scenario : trip;
      expect([line.departureDate, line.returnDate]).toEqual([expected.departureDate, expected.returnDate]);
    }
  });

  it("leaves out another trip's scenarios", () => {
    const otherTripScenario = { ...tripScenarios[0], id: "other-trip-scenario", tripId: "other-trip" };
    const lines = buildScenarioComparison({
      ...shared,
      scenarios: [...tripScenarios, otherTripScenario],
      viewedScenarioId: tripScenarios[0].id,
      movements: fixtures.movements,
      basis: "target",
    });
    expect(lines.map((line) => line.scenarioId)).not.toContain("other-trip-scenario");
  });
});

describe("buildComparisonChartRows", () => {
  const line = (scenarioId: string, points: [string, number][]): ScenarioComparisonLine => ({
    scenarioId,
    name: scenarioId,
    isViewed: false,
    departureDate: null,
    returnDate: null,
    nightsInBeds: null,
    points: points.map(([date, cumulativeUsd]) => ({ date, cumulativeUsd, monthsUntil: 0 })),
    noLineReason: null,
    pots: [],
    missingRateCount: 0,
  });

  it("puts every line on the union of dates, holding each step's value and null outside the line", () => {
    const rows = buildComparisonChartRows([
      line("P", [["2026-11-18", 0], ["2027-01-31", 500], ["2028-06-30", 9000]]),
      line("Q", [["2026-11-18", 0], ["2027-12-31", 1300], ["2028-05-31", 8100]]),
    ]);
    const at = (date: string) => rows.find((row) => row.timestamp === DateTime.fromISO(date, { zone: "utc" }).toMillis())!;
    expect(rows).toHaveLength(5);
    expect(at("2027-12-31")).toMatchObject({ P: 500, Q: 1300 });
    expect(at("2028-06-30")).toMatchObject({ P: 9000, Q: null });
  });

  it("never invents a point for a line with none", () => {
    const rows = buildComparisonChartRows([line("P", [["2026-11-18", 0], ["2028-06-30", 9000]]), line("Q", [])]);
    expect(rows.every((row) => row.Q === null)).toBe(true);
  });
});

describe("buildPotComparisonRows", () => {
  const withPots = (scenarioId: string, pots: [string, number][]): ScenarioComparisonLine => ({
    scenarioId,
    name: scenarioId,
    isViewed: false,
    departureDate: null,
    returnDate: null,
    nightsInBeds: null,
    points: [],
    noLineReason: null,
    pots: pots.map(([dueDate, amountUsd]) => ({ dueDate, amountUsd })),
    missingRateCount: 0,
  });

  it("groups by the union of deadlines, and marks a scenario with nothing due as absent, not zero", () => {
    const rows = buildPotComparisonRows([
      withPots("P", [["2027-12-31", 7.49], ["2028-01-31", 2264], ["2028-06-30", 3104.33]]),
      withPots("Q", [["2027-12-31", 7.49], ["2028-01-31", 1834.61], ["2028-05-31", 899.56], ["2028-06-30", 1861.08]]),
    ]);
    expect(rows.map((row) => row.dueDate)).toEqual(["2027-12-31", "2028-01-31", "2028-05-31", "2028-06-30"]);
    expect(rows.find((row) => row.dueDate === "2028-05-31")!.amounts).toEqual({ P: null, Q: 899.56 });
    expect(rows.find((row) => row.dueDate === "2028-01-31")!.amounts).toEqual({ P: 2264, Q: 1834.61 });
  });

  it("has no groups when no scenario has a pot", () => {
    expect(buildPotComparisonRows([withPots("P", []), withPots("Q", [])])).toEqual([]);
  });
});
