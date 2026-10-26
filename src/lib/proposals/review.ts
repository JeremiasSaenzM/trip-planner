import type { ProposalItem, Source } from "@/lib/data/types";

import { currentFields, readPayload, staleFields, type CurrentRows, type ResolveReference } from "./form-check";
import { isUpdateOp, REFERENCE_FIELDS, type CreateOp, type FieldChange, type Reference, type ReferenceKind } from "./schema";

export type ReviewRows = CurrentRows & { sources: Source[] };

// Where a pending item stands. Only "ready" can be approved; every other
// pending state says why not, and a stale one is reject-only -- the way
// forward is a fresh proposal, never applying over the value that moved.
export type ItemState =
  | { kind: "approved" }
  | { kind: "approved_deleted" }
  | { kind: "rejected" }
  | { kind: "ready" }
  | { kind: "waiting"; on: number[] }
  | { kind: "blocked"; by: number[] }
  | { kind: "stale"; fields: { field: string; expected: unknown; now: unknown }[] }
  | { kind: "missing_target" }
  | { kind: "unreadable" };

// A reference shown by name: an existing row, or another item of this
// batch (with that item's own status).
export type ReferenceLabel =
  | { kind: "existing"; label: string }
  | { kind: "item"; position: number; label: string; status: ProposalItem["status"] }
  | { kind: "unknown"; id: string };

export type FieldRow = {
  field: string;
  /** Only for updates. */
  current?: unknown;
  proposed: unknown;
  /** Set when the field is a reference -- current and proposed by name. */
  currentLabel?: ReferenceLabel | null;
  proposedLabel?: ReferenceLabel | null;
  stale: boolean;
};

export type ItemReview = {
  item: ProposalItem;
  state: ItemState;
  fields: FieldRow[];
  /** Name of the row an update changes, for the heading. */
  targetLabel: string | null;
  /** Every source this item cites, by name. */
  sources: ReferenceLabel[];
  /** A non-blocking heads-up, e.g. a budget line with the same description already exists. */
  warning: string | null;
  /** Pending items that depend on this one, directly or through another item. */
  dependents: number[];
};

/** The resolver approval uses: an item's reference means what its approval created. */
export function resolverFor(items: ProposalItem[]): ResolveReference {
  return (reference) => {
    if ("id" in reference) return reference.id;
    if ("item" in reference) return items.find((i) => i.position === reference.item && i.status === "approved")?.resultId ?? null;
    return null;
  };
}

export function reviewBatch(items: ProposalItem[], rows: ReviewRows): ItemReview[] {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  return sorted.map((item) => reviewItem(item, sorted, rows));
}

function reviewItem(item: ProposalItem, items: ProposalItem[], rows: ReviewRows): ItemReview {
  const payload = readPayload(item.op, item.payload);
  const refFields = REFERENCE_FIELDS[item.op];
  const label = (value: unknown, kind: ReferenceKind) => labelReference(value, kind, items, rows);
  const dependents = pendingDependents(item, items);

  if (!payload) {
    return {
      item,
      state: item.status === "pending" ? { kind: "unreadable" } : decidedState(item, rows),
      fields: [],
      targetLabel: null,
      sources: [],
      warning: null,
      dependents,
    };
  }

  let fields: FieldRow[];
  let targetLabel: string | null = null;
  let current: Record<string, unknown> | null = null;
  let stale: ReturnType<typeof staleFields> = [];

  if (isUpdateOp(item.op)) {
    const changes = (payload as { changes: Record<string, FieldChange> }).changes;
    current = item.targetId ? currentFields(item.op, item.targetId, rows) : null;
    targetLabel = item.targetId ? describeTarget(item.op, item.targetId, rows) : null;
    stale = current ? staleFields(changes, current) : [];
    fields = Object.entries(changes).map(([field, change]) => {
      const kind = refFields[field];
      return {
        field,
        current: current ? (current[field] ?? null) : change.from,
        proposed: change.to,
        currentLabel: kind ? label(current ? current[field] : change.from, kind) : undefined,
        proposedLabel: kind ? label(change.to, kind) : undefined,
        stale: stale.some((s) => s.field === field),
      };
    });
  } else {
    const data = (payload as { data: Record<string, unknown> }).data;
    fields = Object.entries(data).map(([field, value]) => {
      const kind = refFields[field];
      return { field, proposed: value, proposedLabel: kind ? label(value, kind) : undefined, stale: false };
    });
  }

  const sources = fields
    .filter((row) => refFields[row.field] === "source" && row.proposedLabel)
    .map((row) => row.proposedLabel!);

  return {
    item,
    state: item.status === "pending" ? itemState(item, items, current, stale) : decidedState(item, rows),
    fields,
    targetLabel,
    sources,
    warning: item.status === "pending" ? duplicateWarning(item, payload, rows, items) : null,
    dependents,
  };
}

// An approved or rejected item never changes its own mind -- but
// delete_scenario_cascade can remove the row an approved item wrote to
// (proposal_items keeps no live link, on purpose: it's an audit record,
// not a reference that has to resolve), so this is what tells a
// since-deleted result apart from a live one instead of the review
// screen showing, or silently failing to show, a dangling id.
function decidedState(item: ProposalItem, rows: ReviewRows): ItemState {
  if (item.status === "approved") return resultStillExists(item, rows) ? { kind: "approved" } : { kind: "approved_deleted" };
  return { kind: "rejected" };
}

function resultStillExists(item: ProposalItem, rows: ReviewRows): boolean {
  if (!item.resultId) return true;
  if (isUpdateOp(item.op)) return currentFields(item.op, item.resultId, rows) !== null;
  switch (item.op as CreateOp) {
    case "create_source":
      return rows.sources.some((s) => s.id === item.resultId);
    case "create_competition":
      return rows.competitions.some((c) => c.id === item.resultId);
    case "create_scenario":
      return rows.scenarios.some((s) => s.id === item.resultId);
    case "create_budget_line":
      return rows.budgetLines.some((l) => l.id === item.resultId);
    case "create_payment":
      return rows.payments.some((p) => p.id === item.resultId);
    case "create_fx_rate":
      return rows.fxRates.some((r) => r.id === item.resultId);
    case "create_stay":
      return rows.stays.some((s) => s.id === item.resultId);
    case "create_movement":
      return rows.movements.some((m) => m.id === item.resultId);
  }
}

function itemState(
  item: ProposalItem,
  items: ProposalItem[],
  current: Record<string, unknown> | null,
  stale: { field: string; expected: unknown; now: unknown }[],
): ItemState {
  if (isUpdateOp(item.op) && !current) return { kind: "missing_target" };

  const dependencies = items.filter((other) => item.dependsOn.includes(other.position));
  const rejected = dependencies.filter((d) => d.status === "rejected").map((d) => d.position);
  if (rejected.length > 0) return { kind: "blocked", by: rejected };
  const pending = dependencies.filter((d) => d.status === "pending").map((d) => d.position);
  if (pending.length > 0) return { kind: "waiting", on: pending };

  if (stale.length > 0) return { kind: "stale", fields: stale };
  return { kind: "ready" };
}

/** Pending items that would be left blocked if this one were rejected. */
function pendingDependents(item: ProposalItem, items: ProposalItem[]): number[] {
  const found = new Set<number>();
  const queue = [item.position];
  while (queue.length > 0) {
    const position = queue.shift()!;
    for (const other of items) {
      if (other.dependsOn.includes(position) && !found.has(other.position)) {
        found.add(other.position);
        queue.push(other.position);
      }
    }
  }
  return items.filter((other) => found.has(other.position) && other.status === "pending").map((other) => other.position);
}

function labelReference(value: unknown, kind: ReferenceKind, items: ProposalItem[], rows: ReviewRows): ReferenceLabel | null {
  if (value === null || value === undefined) return null;

  // A current value is a bare id; a proposed one is a Reference.
  const reference: Reference = typeof value === "string" ? { id: value } : (value as Reference);

  if ("item" in reference) {
    const target = items.find((other) => other.position === reference.item);
    if (!target) return { kind: "unknown", id: `item ${reference.item + 1}` };
    if (target.status === "approved" && target.resultId) {
      const existing = existingName(target.resultId, kind, rows);
      if (existing) return { kind: "existing", label: existing };
    }
    const payload = readPayload(target.op, target.payload);
    const data = payload && "data" in payload ? payload.data : {};
    const name = (data.name ?? data.description ?? data.provider ?? `item ${target.position + 1}`) as string;
    return { kind: "item", position: target.position, label: name, status: target.status };
  }

  if ("id" in reference) {
    const existing = existingName(reference.id, kind, rows);
    return existing ? { kind: "existing", label: existing } : { kind: "unknown", id: reference.id };
  }

  return null;
}

/**
 * Every {"id"} reference in an item that doesn't name one of your rows
 * of the right kind, in this trip -- refused when the paste is saved,
 * so a typo'd or foreign id never makes it into a batch. (proposal_ref()
 * checks the same at approval, against the database itself.)
 */
export function unknownReferences(
  item: { op: ProposalItem["op"]; payload: unknown },
  tripId: string,
  rows: ReviewRows,
): string[] {
  const payload = readPayload(item.op, item.payload);
  if (!payload) return [];

  const values: [field: string, value: unknown][] =
    "data" in payload
      ? Object.entries(payload.data)
      : Object.entries(payload.changes).map(([field, change]) => [field, change.to]);

  return Object.entries(REFERENCE_FIELDS[item.op]).flatMap(([field, kind]) => {
    const value = values.find(([name]) => name === field)?.[1] as Reference | null | undefined;
    if (!value || !("id" in value)) return [];
    const exists =
      kind === "source"
        ? rows.sources.some((s) => s.id === value.id)
        : kind === "competition"
          ? rows.competitions.some((c) => c.id === value.id && c.tripId === tripId)
          : kind === "scenario"
            ? rows.scenarios.some((s) => s.id === value.id && s.tripId === tripId)
            : rows.budgetLines.some((l) => l.id === value.id && l.tripId === tripId);
    return exists ? [] : [`${field}: no ${kind.replace("_", " ")} with id ${value.id} in this trip`];
  });
}

function existingName(id: string, kind: ReferenceKind, rows: ReviewRows): string | null {
  switch (kind) {
    case "source": {
      const source = rows.sources.find((s) => s.id === id);
      return source ? `${source.provider} (tier ${source.tier}, observed ${source.observedOn})` : null;
    }
    case "competition":
      return rows.competitions.find((c) => c.id === id)?.name ?? null;
    case "scenario":
      return rows.scenarios.find((s) => s.id === id)?.name ?? null;
    case "budget_line":
      return rows.budgetLines.find((l) => l.id === id)?.description ?? null;
  }
}

function describeTarget(op: ProposalItem["op"], id: string, rows: ReviewRows): string | null {
  switch (op) {
    case "update_competition":
      return rows.competitions.find((c) => c.id === id)?.name ?? null;
    case "update_scenario":
      return rows.scenarios.find((s) => s.id === id)?.name ?? null;
    case "update_budget_line":
      return rows.budgetLines.find((l) => l.id === id)?.description ?? null;
    case "update_payment":
      return rows.payments.find((p) => p.id === id)?.description ?? null;
    case "update_fx_rate": {
      const rate = rows.fxRates.find((r) => r.id === id);
      return rate ? `${rate.currency} ${rate.rateKind.replace("_", " ")} rate, ${rate.rateDate}` : null;
    }
    case "update_savings_entry": {
      const entry = rows.savingsEntries.find((e) => e.id === id);
      return entry ? `Savings entry of ${entry.recordedOn}` : null;
    }
    case "update_stay": {
      const stay = rows.stays.find((s) => s.id === id);
      return stay ? `${stay.location}, ${stay.startDate}` : null;
    }
    case "update_movement": {
      const movement = rows.movements.find((m) => m.id === id);
      return movement ? `${movement.fromLocation} → ${movement.toLocation}, ${movement.departDate}` : null;
    }
    default:
      return null;
  }
}

// Never blocks approval -- two lines with the same description can be
// right -- but says so, since a research batch re-proposing something
// already recorded is the likeliest mistake.
function duplicateWarning(
  item: ProposalItem,
  payload: { data: Record<string, unknown> } | { changes: Record<string, FieldChange> },
  rows: ReviewRows,
  items: ProposalItem[],
): string | null {
  if (!("data" in payload)) return null;
  const data = payload.data;
  const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();

  switch (item.op) {
    case "create_budget_line": {
      const scenarioId = data.scenario ? resolverFor(items)(data.scenario as Reference) : null;
      const match = rows.budgetLines.find(
        (line) => same(line.description, data.description) && (data.scenario ? line.scenarioId === scenarioId : line.scenarioId === null),
      );
      return match ? `A budget line called "${match.description}" already exists here.` : null;
    }
    case "create_competition": {
      const match = rows.competitions.find((c) => same(c.name, data.name));
      return match ? `A competition called "${match.name}" already exists.` : null;
    }
    case "create_scenario": {
      const match = rows.scenarios.find((s) => same(s.name, data.name));
      return match ? `A scenario called "${match.name}" already exists.` : null;
    }
    case "create_fx_rate": {
      const match = rows.fxRates.find(
        (r) => r.currency === data.currency && r.rateDate === data.rateDate && r.rateKind === data.rateKind,
      );
      return match ? "There's already a rate for this currency, date and kind -- approving this one will be refused." : null;
    }
    default:
      return null;
  }
}
