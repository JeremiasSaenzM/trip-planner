import { describe, expect, it } from "vitest";

import * as fixtures from "@/lib/data/fixtures";
import type { ProposalItem, Source } from "@/lib/data/types";

import { readPayload } from "./form-check";
import { resolverFor, reviewBatch, unknownReferences, type ReviewRows } from "./review";

const TRIP_ID = "20000000-0000-0000-0000-000000000001";

const rows: ReviewRows = {
  sources: fixtures.sources,
  competitions: fixtures.competitions,
  scenarios: fixtures.scenarios,
  budgetLines: fixtures.budgetLines,
  payments: fixtures.payments,
  fxRates: fixtures.fxRates,
  savingsEntries: fixtures.savingsEntries,
  stays: fixtures.stays,
  movements: fixtures.movements,
  flightOptions: fixtures.flightOptions,
  flightSegments: fixtures.flightSegments,
};

// The demo batch: 0 creates a source; 1 updates Round-trip flight's
// target and points it at that source (depends on 0); 2 creates a
// budget line; 3 updates the same line's minimum from 500 -- but it's 520.
const items = fixtures.proposalItems;

function stateOf(reviewed: ReturnType<typeof reviewBatch>, position: number) {
  return reviewed.find((review) => review.item.position === position)!.state;
}

describe("reviewBatch", () => {
  it("reads every demo fixture's payload back through its schema", () => {
    for (const item of items) expect(readPayload(item.op, item.payload)).not.toBeNull();
  });

  it("says where each pending item stands", () => {
    const reviewed = reviewBatch(items, rows);
    expect(stateOf(reviewed, 0)).toEqual({ kind: "ready" });
    expect(stateOf(reviewed, 1)).toEqual({ kind: "waiting", on: [0] });
    expect(stateOf(reviewed, 2)).toEqual({ kind: "ready" });
    expect(stateOf(reviewed, 3)).toEqual({ kind: "stale", fields: [{ field: "amountMin", expected: 500, now: 520 }] });
  });

  it("shows an update's current value next to the proposed one, and a reference by name", () => {
    const review = reviewBatch(items, rows).find((r) => r.item.position === 1)!;
    expect(review.targetLabel).toBe("Round-trip flight");
    expect(review.fields).toEqual([
      { field: "amountTarget", current: 650, proposed: 610, currentLabel: undefined, proposedLabel: undefined, stale: false },
      {
        field: "source",
        current: null,
        proposed: { item: 0 },
        currentLabel: null,
        proposedLabel: { kind: "item", position: 0, label: "Fictional fare tracker", status: "pending" },
        stale: false,
      },
    ]);
    expect(review.sources).toEqual([{ kind: "item", position: 0, label: "Fictional fare tracker", status: "pending" }]);
  });

  it("labels an update_stay's target the same way the itinerary page does", () => {
    const stay = fixtures.stays[0];
    const updateStay: ProposalItem = {
      id: "c0000000-0000-0000-0000-000000000001",
      batchId: items[0].batchId,
      position: 0,
      ref: null,
      op: "update_stay",
      targetId: stay.id,
      payload: { changes: { nights: { from: stay.nights, to: stay.nights + 1 } } },
      dependsOn: [],
      reason: "A reason",
      status: "pending",
      decisionReason: null,
      decidedAt: null,
      resultId: null,
      createdAt: "2026-10-12T00:00:00Z",
    };
    const review = reviewBatch([updateStay], rows)[0];
    expect(review.targetLabel).toBe(`${stay.location}, ${stay.startDate}`);
  });

  it("lists what depends on an item, so rejecting it can ask what to do with them", () => {
    const reviewed = reviewBatch(items, rows);
    expect(reviewed.find((r) => r.item.position === 0)!.dependents).toEqual([1]);
    expect(reviewed.find((r) => r.item.position === 2)!.dependents).toEqual([]);
  });

  it("becomes ready once its dependency is approved, naming the row that was created", () => {
    const newSource: Source = {
      id: "30000000-0000-0000-0000-0000000000aa",
      provider: "Fictional fare tracker",
      tier: 3,
      url: "https://example.com/fares",
      observedOn: "2026-10-12",
      applicablePeriod: null,
      notes: null,
      createdAt: "2026-10-12T00:00:00Z",
    };
    const approved: ProposalItem[] = items.map((item) =>
      item.position === 0 ? { ...item, status: "approved", decidedAt: "2026-10-13T00:00:00Z", resultId: newSource.id } : item,
    );
    const review = reviewBatch(approved, { ...rows, sources: [...rows.sources, newSource] }).find((r) => r.item.position === 1)!;

    expect(review.state).toEqual({ kind: "ready" });
    expect(review.sources).toEqual([{ kind: "existing", label: "Fictional fare tracker (tier 3, observed 2026-10-12)" }]);
    expect(resolverFor(approved)({ item: 0 })).toBe(newSource.id);
  });

  it("is blocked, not silently dropped, when its dependency was rejected", () => {
    const rejected: ProposalItem[] = items.map((item) =>
      item.position === 0 ? { ...item, status: "rejected", decisionReason: "Not a real source", decidedAt: "2026-10-13T00:00:00Z" } : item,
    );
    expect(stateOf(reviewBatch(rejected, rows), 1)).toEqual({ kind: "blocked", by: [0] });
  });

  it("says when an update's target is gone", () => {
    const gone: ProposalItem = { ...items[3], targetId: "70000000-0000-0000-0000-0000000000ff" };
    expect(stateOf(reviewBatch([gone], rows), 3)).toEqual({ kind: "missing_target" });
  });

  it("flags an unreadable payload instead of guessing at it", () => {
    const broken: ProposalItem = { ...items[2], payload: { data: { description: "no other fields" } } };
    expect(stateOf(reviewBatch([broken], rows), 2)).toEqual({ kind: "unreadable" });
  });

  it("warns, without blocking, when a create looks like a duplicate", () => {
    const duplicate: ProposalItem = {
      ...items[2],
      payload: {
        data: {
          ...(items[2].payload as { data: Record<string, unknown> }).data,
          description: "round-trip flight",
        },
      },
    };
    const review = reviewBatch([duplicate], rows)[0];
    expect(review.state).toEqual({ kind: "ready" });
    expect(review.warning).toBe('A budget line called "Round-trip flight" already exists here.');
  });

  it("leaves decided items as they are", () => {
    const decided: ProposalItem[] = [
      { ...items[2], status: "approved", decidedAt: "2026-10-13T00:00:00Z", resultId: fixtures.budgetLines[0].id },
      { ...items[3], status: "rejected", decisionReason: "Stale", decidedAt: "2026-10-13T00:00:00Z" },
    ];
    const reviewed = reviewBatch(decided, rows);
    expect(reviewed.map((r) => r.state.kind)).toEqual(["approved", "rejected"]);
    expect(reviewed.every((r) => r.warning === null)).toBe(true);
  });

  it("says when an approved item's result has since been deleted (e.g. by delete_scenario_cascade)", () => {
    const approved: ProposalItem = {
      ...items[2],
      status: "approved",
      decidedAt: "2026-10-13T00:00:00Z",
      resultId: "70000000-0000-0000-0000-0000000000bb",
    };
    expect(stateOf(reviewBatch([approved], rows), approved.position)).toEqual({ kind: "approved_deleted" });
  });

  it("still says 'approved' once the update it made is itself undone by a later, unrelated change", () => {
    // update_stay's resultId is its targetId -- the row it changed, not
    // a new row it created -- so the same currentFields lookup that
    // finds "missing_target" for a pending item also answers this.
    const stay = fixtures.stays[0];
    const approvedUpdate: ProposalItem = {
      id: "c0000000-0000-0000-0000-000000000002",
      batchId: items[0].batchId,
      position: 0,
      ref: null,
      op: "update_stay",
      targetId: stay.id,
      payload: { changes: { nights: { from: stay.nights, to: stay.nights + 1 } } },
      dependsOn: [],
      reason: "A reason",
      status: "approved",
      decisionReason: null,
      decidedAt: "2026-10-13T00:00:00Z",
      resultId: stay.id,
      createdAt: "2026-10-12T00:00:00Z",
    };
    expect(stateOf(reviewBatch([approvedUpdate], rows), 0)).toEqual({ kind: "approved" });
    const afterDelete = { ...rows, stays: rows.stays.filter((s) => s.id !== stay.id) };
    expect(stateOf(reviewBatch([approvedUpdate], afterDelete), 0)).toEqual({ kind: "approved_deleted" });
  });
});

describe("unknownReferences", () => {
  it("accepts references to your own rows in this trip", () => {
    expect(unknownReferences(items[2], TRIP_ID, rows)).toEqual([]);
  });

  it("names an {id} that isn't one of your rows", () => {
    const item = {
      op: "create_budget_line" as const,
      payload: {
        data: {
          ...(items[2].payload as { data: Record<string, unknown> }).data,
          scenario: { id: "50000000-0000-0000-0000-0000000000ff" },
          source: { id: "30000000-0000-0000-0000-0000000000ff" },
        },
      },
    };
    expect(unknownReferences(item, TRIP_ID, rows)).toEqual([
      "scenario: no scenario with id 50000000-0000-0000-0000-0000000000ff in this trip",
      "source: no source with id 30000000-0000-0000-0000-0000000000ff in this trip",
    ]);
  });

  it("refuses a scenario from a different trip", () => {
    expect(unknownReferences(items[2], "20000000-0000-0000-0000-0000000000ff", rows)).toEqual([
      "scenario: no scenario with id 50000000-0000-0000-0000-000000000001 in this trip",
    ]);
  });
});
