import type { z } from "zod";

import type { ProposalItemWrite } from "@/lib/data/types";

import {
  isUpdateOp,
  MAX_PROPOSAL_TEXT_BYTES,
  PROPOSAL_OPS,
  pastedBatch,
  REFERENCE_FIELDS,
  type PastedItem,
  type Reference,
  type ReferenceKind,
} from "./schema";

export type ParsedPaste =
  | { ok: true; note: string | undefined; items: ProposalItemWrite[] }
  | { ok: false; problems: string[] };

/**
 * Turns pasted text into the items create_proposal_batch() stores, or
 * every problem with it. All or nothing: a paste with one bad item saves
 * nothing, so what's stored is always exactly what was reviewed.
 *
 * Each {"ref": "x"} becomes {"item": <position of x>}, and the positions
 * an item points at become its dependsOn -- that's what approval waits on.
 */
export function parseProposalPaste(text: string): ParsedPaste {
  if (new TextEncoder().encode(text).length > MAX_PROPOSAL_TEXT_BYTES) {
    return { ok: false, problems: [`That's too much to paste at once (the limit is ${MAX_PROPOSAL_TEXT_BYTES / 1000} KB).`] };
  }
  if (text.trim() === "") {
    return { ok: false, problems: ["Paste the proposals first."] };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, problems: [`That isn't valid JSON: ${(error as Error).message}`] };
  }

  const parsed = pastedBatch.safeParse(json);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((issue) => describeIssue(issue, json)) };
  }

  return linkReferences(parsed.data.items, parsed.data.note);
}

// "Item 4 (create_budget_line), data.amountTarget: ..." -- numbered from
// 1, the way a person counts, with the op read off the raw item so the
// message says what kind of item it was even when the item itself is
// what failed.
function describeIssue(issue: z.core.$ZodIssue, json: unknown): string {
  const [first, index, ...rest] = issue.path;
  if (first !== "items" || typeof index !== "number") {
    const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${where}${issue.message}`;
  }

  const rawItems = (json as { items?: unknown[] }).items ?? [];
  const rawOp = (rawItems[index] as { op?: unknown } | undefined)?.op;
  const label = typeof rawOp === "string" ? ` (${rawOp})` : "";

  // An unknown op fails the discriminated union at the item's "op" key.
  if (issue.code === "invalid_union" && (rest.length === 0 || (rest.length === 1 && rest[0] === "op"))) {
    return `Item ${index + 1}${label}: "op" must be one of ${PROPOSAL_OPS.join(", ")}.`;
  }

  const where = rest.length > 0 ? `${rest.join(".")}: ` : "";
  return `Item ${index + 1}${label}, ${where}${issue.message}`;
}

function linkReferences(items: PastedItem[], note: string | undefined): ParsedPaste {
  const problems: string[] = [];
  const refs = new Map<string, { position: number; op: PastedItem["op"] }>();
  const linked: ProposalItemWrite[] = [];

  items.forEach((item, position) => {
    const dependsOn = new Set<number>();
    const fields = REFERENCE_FIELDS[item.op];

    function link(value: Reference | null | undefined, field: string, kind: ReferenceKind) {
      if (value === null || value === undefined || "id" in value) return value;
      if ("item" in value) {
        problems.push(`Item ${position + 1} (${item.op}), ${field}: point at another item with {"ref": "..."}, not {"item": ...}.`);
        return value;
      }
      const target = refs.get(value.ref);
      if (!target) {
        problems.push(`Item ${position + 1} (${item.op}), ${field}: "${value.ref}" isn't the ref of an earlier item.`);
        return value;
      }
      if (target.op !== `create_${kind}`) {
        problems.push(
          `Item ${position + 1} (${item.op}), ${field}: "${value.ref}" is a ${target.op}, but this needs a ${kind.replace("_", " ")}.`,
        );
        return value;
      }
      dependsOn.add(target.position);
      return { item: target.position };
    }

    let payload: { data: Record<string, unknown> } | { changes: Record<string, unknown> };
    if (isUpdateOp(item.op)) {
      const changes: Record<string, unknown> = { ...(item as Extract<PastedItem, { target: string }>).changes };
      for (const [field, kind] of Object.entries(fields)) {
        const fieldChange = changes[field] as { from: unknown; to: Reference | null } | undefined;
        if (fieldChange) changes[field] = { ...fieldChange, to: link(fieldChange.to, `changes.${field}.to`, kind) };
      }
      payload = { changes };
    } else {
      const data: Record<string, unknown> = { ...(item as Extract<PastedItem, { data: unknown }>).data };
      for (const [field, kind] of Object.entries(fields)) {
        if (data[field] !== undefined) data[field] = link(data[field] as Reference, `data.${field}`, kind);
      }
      payload = { data };
    }

    // Registered only after its own references are linked, so an item
    // can never point at itself.
    const ref = "ref" in item ? item.ref : undefined;
    if (ref !== undefined) {
      if (refs.has(ref)) {
        problems.push(`Item ${position + 1} (${item.op}): the ref "${ref}" is already used by item ${refs.get(ref)!.position + 1}.`);
      } else {
        refs.set(ref, { position, op: item.op });
      }
    }

    linked.push({
      position,
      ref: ref ?? null,
      op: item.op,
      targetId: "target" in item ? item.target : null,
      payload,
      dependsOn: [...dependsOn].sort((a, b) => a - b),
      reason: item.reason,
    });
  });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, note, items: linked };
}
