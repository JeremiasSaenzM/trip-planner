import { describe, expect, it } from "vitest";

import { parseProposalPaste } from "./parse";
import { MAX_PROPOSAL_ITEMS, MAX_PROPOSAL_TEXT_BYTES } from "./schema";

const SCENARIO_ID = "50000000-0000-0000-0000-000000000001";
const LINE_ID = "70000000-0000-0000-0000-000000000002";

function paste(items: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: "trip-planner-proposals", version: 1, ...extra, items });
}

const competition = {
  op: "create_competition",
  ref: "comp",
  reason: "Host announced",
  data: { name: "Fictional Festival 2028" },
};
const scenario = {
  op: "create_scenario",
  ref: "scn",
  reason: "One scenario per candidate",
  data: { name: "Fictional 2028", competition: { ref: "comp" } },
};
const line = {
  op: "create_budget_line",
  reason: "Fare research",
  data: {
    scenario: { ref: "scn" },
    category: "B",
    description: "Flights",
    amountMin: 900,
    amountTarget: 1000,
    amountConservative: 1200,
    currency: "EUR",
    informationState: "estimate",
  },
};
const update = {
  op: "update_budget_line",
  target: LINE_ID,
  reason: "Cheaper fare found",
  changes: { amountTarget: { from: 2100, to: 1650 } },
};

function omit(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

function problemsOf(text: string): string[] {
  const result = parseProposalPaste(text);
  if (result.ok) throw new Error("expected the paste to be refused");
  return result.problems;
}

describe("parseProposalPaste: a valid batch", () => {
  it("links refs to positions and records what each item depends on", () => {
    const result = parseProposalPaste(paste([competition, scenario, line, update], { note: "Research, 20 Oct" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.note).toBe("Research, 20 Oct");
    expect(result.items.map((item) => [item.position, item.op, item.dependsOn])).toEqual([
      [0, "create_competition", []],
      [1, "create_scenario", [0]],
      [2, "create_budget_line", [1]],
      [3, "update_budget_line", []],
    ]);
    expect(result.items[1].payload).toEqual({ data: { name: "Fictional 2028", competition: { item: 0 } } });
    expect((result.items[2].payload as { data: { scenario: unknown } }).data.scenario).toEqual({ item: 1 });
    expect(result.items[3]).toMatchObject({
      targetId: LINE_ID,
      ref: null,
      payload: { changes: { amountTarget: { from: 2100, to: 1650 } } },
      reason: "Cheaper fare found",
    });
  });

  it("links a stay and a movement to a scenario created earlier in the same paste", () => {
    const stay = {
      op: "create_stay",
      reason: "Fixed accommodation",
      data: { scenario: { ref: "scn" }, location: "Fontvieux", startDate: "2027-07-04", nights: 8, kind: "festival", informationState: "estimate" },
    };
    const movement = {
      op: "create_movement",
      reason: "Outbound flight",
      data: {
        scenario: { ref: "scn" },
        sequence: 1,
        fromLocation: "Madrid",
        toLocation: "Fontvieux",
        departDate: "2027-07-04",
        arriveDate: "2027-07-04",
        mode: "plane",
        informationState: "estimate",
      },
    };
    const result = parseProposalPaste(paste([competition, scenario, stay, movement]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.items.map((item) => [item.position, item.op, item.dependsOn])).toEqual([
      [0, "create_competition", []],
      [1, "create_scenario", [0]],
      [2, "create_stay", [1]],
      [3, "create_movement", [1]],
    ]);
    expect((result.items[2].payload as { data: { scenario: unknown } }).data.scenario).toEqual({ item: 1 });
    expect((result.items[3].payload as { data: { scenario: unknown } }).data.scenario).toEqual({ item: 1 });
  });

  it("keeps {id} references to existing rows as they are, lower-cased", () => {
    const result = parseProposalPaste(
      paste([{ ...line, data: { ...line.data, scenario: { id: SCENARIO_ID.toUpperCase() } } }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.items[0].payload as { data: { scenario: unknown } }).data.scenario).toEqual({ id: SCENARIO_ID });
    expect(result.items[0].dependsOn).toEqual([]);
  });

  it("links a reference inside an update's 'to'", () => {
    const result = parseProposalPaste(
      paste([
        { op: "create_source", ref: "src", reason: "Where it came from", data: { provider: "Fictional fares", tier: 3, observedOn: "2026-10-01" } },
        { ...update, changes: { source: { from: null, to: { ref: "src" } } } },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[1].payload).toEqual({ changes: { source: { from: null, to: { item: 0 } } } });
    expect(result.items[1].dependsOn).toEqual([0]);
  });

  it("trims text values", () => {
    const result = parseProposalPaste(paste([{ ...competition, reason: "  spaced  ", data: { name: "  Festival  " } }]));
    expect(result.ok && result.items[0]).toMatchObject({ reason: "spaced", payload: { data: { name: "Festival" } } });
  });
});

describe("parseProposalPaste: malformed input", () => {
  it("refuses an empty paste", () => {
    expect(problemsOf("   ")).toEqual(["Paste the proposals first."]);
  });

  it("refuses text that isn't JSON", () => {
    expect(problemsOf("create competition X please")[0]).toMatch(/^That isn't valid JSON/);
  });

  it("refuses the wrong format or version", () => {
    expect(problemsOf(JSON.stringify({ format: "something-else", version: 1, items: [competition] })).join(" ")).toMatch(
      /"format" must be "trip-planner-proposals"/,
    );
    expect(problemsOf(JSON.stringify({ format: "trip-planner-proposals", version: 2, items: [competition] })).join(" ")).toMatch(
      /"version" must be 1/,
    );
  });

  it("refuses a paste with no items", () => {
    expect(problemsOf(paste([])).join(" ")).toMatch(/at least one item/);
  });

  it("refuses an item with no reason, or a blank one", () => {
    expect(problemsOf(paste([omit(competition, "reason")]))[0]).toMatch(/^Item 1 \(create_competition\), reason:/);
    expect(problemsOf(paste([{ ...competition, reason: "   " }]))[0]).toMatch(/Every proposal needs a reason/);
  });

  it("names the item, its op and the field for a wrong type", () => {
    const problems = problemsOf(paste([competition, { ...line, data: { ...line.data, amountTarget: "1000" } }]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^Item 2 \(create_budget_line\), data\.amountTarget:/);
  });

  it("refuses an operation outside the whitelist", () => {
    expect(problemsOf(paste([{ op: "delete_trip", reason: "x", data: {} }]))[0]).toMatch(
      /^Item 1 \(delete_trip\): "op" must be one of create_source, .*update_movement\.$/,
    );
  });

  it("refuses an update with no changes, or with no target", () => {
    expect(problemsOf(paste([{ ...update, changes: {} }])).join(" ")).toMatch(/at least one change/);
    expect(problemsOf(paste([omit(update, "target")])).join(" ")).toMatch(/target/);
  });

  it("refuses an update change without its 'from'", () => {
    expect(problemsOf(paste([{ ...update, changes: { amountTarget: { to: 1650 } } }])).join(" ")).toMatch(
      /changes\.amountTarget\.from/,
    );
  });

  it("refuses a reference to a ref that doesn't exist yet, or comes later", () => {
    expect(problemsOf(paste([scenario]))).toEqual([
      'Item 1 (create_scenario), data.competition: "comp" isn\'t the ref of an earlier item.',
    ]);
    expect(problemsOf(paste([scenario, competition]))[0]).toMatch(/isn't the ref of an earlier item/);
  });

  it("refuses a reference to an item of the wrong kind", () => {
    expect(problemsOf(paste([competition, { ...line, data: { ...line.data, scenario: { ref: "comp" } } }]))).toEqual([
      'Item 2 (create_budget_line), data.scenario: "comp" is a create_competition, but this needs a scenario.',
    ]);
  });

  it("refuses an item that references itself", () => {
    expect(problemsOf(paste([{ ...scenario, ref: "comp", data: { name: "Loop", competition: { ref: "comp" } } }]))[0]).toMatch(
      /isn't the ref of an earlier item/,
    );
  });

  it("refuses a duplicate ref", () => {
    expect(problemsOf(paste([competition, competition]))).toEqual([
      'Item 2 (create_competition): the ref "comp" is already used by item 1.',
    ]);
  });

  it("refuses the stored {item: n} form in a paste", () => {
    expect(problemsOf(paste([competition, { ...scenario, data: { name: "x", competition: { item: 0 } } }]))[0]).toMatch(
      /not \{"item": \.\.\.\}/,
    );
  });

  it("refuses an impossible date", () => {
    expect(problemsOf(paste([{ ...competition, data: { name: "x", startDate: "2027-02-31", endDate: "2027-03-02" } }]))[0]).toMatch(
      /That isn't a real date/,
    );
  });
});

describe("parseProposalPaste: hostile input", () => {
  it("refuses an unknown key at every level", () => {
    expect(problemsOf(paste([competition], { table: "payments" })).join(" ")).toMatch(/table/);
    expect(problemsOf(paste([{ ...competition, column: "owner_id" }])).join(" ")).toMatch(/column/);
    expect(problemsOf(paste([{ ...competition, data: { ...competition.data, owner_id: "x" } }])).join(" ")).toMatch(/owner_id/);
  });

  it("refuses a smuggled trip id on a create", () => {
    expect(
      problemsOf(paste([{ ...competition, data: { ...competition.data, tripId: "20000000-0000-0000-0000-000000000099" } }])).join(" "),
    ).toMatch(/tripId/);
  });

  it("refuses a field an update can't touch, such as a payment's status", () => {
    expect(
      problemsOf(
        paste([{ op: "update_payment", target: LINE_ID, reason: "x", changes: { status: { from: "planned", to: "paid" } } }]),
      ).join(" "),
    ).toMatch(/status/);
  });

  it("refuses __proto__ and constructor keys rather than merging them", () => {
    const text = `{"format": "trip-planner-proposals", "version": 1, "items": [{"op": "create_competition", "reason": "x", "data": {"name": "x", "__proto__": {"polluted": true}}}]}`;
    expect(problemsOf(text).join(" ")).toMatch(/__proto__/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    const constructorText = paste([{ ...competition, data: { name: "x", constructor: { prototype: { polluted: true } } } }]);
    expect(problemsOf(constructorText).join(" ")).toMatch(/constructor/);
  });

  it("refuses javascript:, data: and other non-http(s) source URLs", () => {
    for (const url of ["javascript:alert(document.cookie)", "data:text/html,<script>alert(1)</script>", "file:///etc/passwd"]) {
      const text = paste([{ op: "create_source", reason: "x", data: { provider: "x", tier: 1, observedOn: "2026-10-01", url } }]);
      expect(problemsOf(text).join(" ")).toMatch(/Only http:\/\/ and https:\/\/ links are allowed|doesn't look like a URL/);
    }
  });

  it("refuses an id that isn't a uuid, such as SQL", () => {
    expect(
      problemsOf(paste([{ ...update, target: "'; drop table budget_lines; --" }])).join(" "),
    ).toMatch(/target/);
    expect(
      problemsOf(paste([{ ...line, data: { ...line.data, scenario: { id: "1 or 1=1" } } }])).join(" "),
    ).toMatch(/scenario/);
  });

  it("stores SQL-looking text as plain text -- it is only ever a value", () => {
    const result = parseProposalPaste(
      paste([{ ...competition, data: { name: "Robert'); drop table competitions;--" } }]),
    );
    expect(result.ok && result.items[0].payload).toEqual({ data: { name: "Robert'); drop table competitions;--" } });
  });

  it("refuses Infinity (1e400), negative amounts and amounts too large for the column", () => {
    const withTarget = (value: string) =>
      `{"format": "trip-planner-proposals", "version": 1, "items": [{"op": "update_budget_line", "target": "${LINE_ID}", "reason": "x", "changes": {"amountTarget": {"from": 1, "to": ${value}}}}]}`;
    expect(problemsOf(withTarget("1e400")).join(" ")).toMatch(/amountTarget/);
    expect(problemsOf(withTarget("-5")).join(" ")).toMatch(/amountTarget/);
    expect(problemsOf(withTarget("100000000000")).join(" ")).toMatch(/too large/);
  });

  it("refuses an over-long string", () => {
    expect(problemsOf(paste([{ ...competition, data: { name: "x".repeat(201) } }])).join(" ")).toMatch(/under 200/);
    expect(problemsOf(paste([{ ...competition, reason: "x".repeat(1001) }])).join(" ")).toMatch(/under 1000/);
  });

  it("refuses more items than a batch can hold", () => {
    const items = Array.from({ length: MAX_PROPOSAL_ITEMS + 1 }, () => ({ ...competition, ref: undefined }));
    expect(problemsOf(paste(items)).join(" ")).toMatch(/at most 200 items/);
  });

  it("refuses a paste over the size limit before even parsing it", () => {
    const text = paste([{ ...competition, reason: "x".repeat(MAX_PROPOSAL_TEXT_BYTES) }]);
    expect(problemsOf(text)).toEqual(["That's too much to paste at once (the limit is 200 KB)."]);
  });

  it("refuses a top-level array or a bare value", () => {
    expect(problemsOf("[]").length).toBeGreaterThan(0);
    expect(problemsOf("42").length).toBeGreaterThan(0);
    expect(problemsOf("null").length).toBeGreaterThan(0);
  });
});
