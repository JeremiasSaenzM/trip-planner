import { describe, expect, it } from "vitest";

import type { BudgetLine, Source } from "@/lib/data/types";

import { summarizeBudgetEvidence } from "./scenario-evidence";

function line(id: string, overrides: Partial<BudgetLine>): BudgetLine {
  return {
    id,
    tripId: "trip",
    scenarioId: "scenario",
    category: "A",
    description: id,
    amountMin: 1,
    amountTarget: 1,
    amountConservative: 1,
    currency: "USD",
    informationState: "estimate",
    sourceId: null,
    notes: null,
    confidence: null,
    autoCreated: false,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

const SOURCE: Source = {
  id: "src-1",
  provider: "Fictional festival site",
  tier: 1,
  url: "https://example.invalid/festival",
  observedOn: "2026-10-01",
  applicablePeriod: null,
  notes: null,
  createdAt: "2026-10-01T00:00:00Z",
};

describe("summarizeBudgetEvidence", () => {
  const lines = [
    line("flights", { category: "B", sourceId: "src-1", informationState: "confirmed", confidence: "high" }),
    line("food", { category: "E", confidence: "low" }),
    line("fee", { category: "A", sourceId: "src-1", informationState: "estimate", confidence: "low" }),
    line("lodging", { category: "C", informationState: "pending" }),
    line("dangling", { category: "D", sourceId: "src-missing" }),
  ];
  const evidence = summarizeBudgetEvidence(lines, [SOURCE]);

  it("pairs each sourced line with its source, by category", () => {
    expect(evidence.sourced.map((s) => [s.line.id, s.source.provider])).toEqual([
      ["fee", "Fictional festival site"],
      ["flights", "Fictional festival site"],
    ]);
  });

  it("names every line with no source -- including one whose source can't be found, never a guessed one", () => {
    expect(evidence.unsourced.map((l) => l.id)).toEqual(["lodging", "dangling", "food"]);
  });

  it("groups by information state, only states that occur, in the usual order", () => {
    expect(evidence.byState.map((g) => [g.state, g.lines.map((l) => l.id)])).toEqual([
      ["estimate", ["fee", "dangling", "food"]],
      ["pending", ["lodging"]],
      ["confirmed", ["flights"]],
    ]);
  });

  it("groups by confidence with not assessed last, never folded into low", () => {
    expect(evidence.byConfidence.map((g) => [g.confidence, g.lines.map((l) => l.id)])).toEqual([
      ["high", ["flights"]],
      ["low", ["fee", "food"]],
      [null, ["lodging", "dangling"]],
    ]);
    expect(evidence.lowConfidence.map((l) => l.id)).toEqual(["fee", "food"]);
  });

  it("handles a scenario with no budget lines", () => {
    expect(summarizeBudgetEvidence([], [])).toEqual({
      sourced: [],
      unsourced: [],
      byState: [],
      byConfidence: [],
      lowConfidence: [],
    });
  });
});
