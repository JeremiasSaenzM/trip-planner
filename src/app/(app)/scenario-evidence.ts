import type { BudgetLine, Source } from "@/lib/data/types";
import type { Confidence, InfoState } from "@/lib/domain/types";

import { INFO_STATE_ORDER } from "./info-state-labels";

export type SourcedLine = { line: BudgetLine; source: Source };

export type BudgetEvidence = {
  /** Every line with a source, by category then description. */
  sourced: SourcedLine[];
  /** Lines with no source at all -- named on the page, never just counted. */
  unsourced: BudgetLine[];
  /** Only states that have at least one line, in INFO_STATE_ORDER. */
  byState: { state: InfoState; lines: BudgetLine[] }[];
  /** high, medium, low, then not assessed (null) -- only non-empty groups. */
  byConfidence: { confidence: Confidence | null; lines: BudgetLine[] }[];
  lowConfidence: BudgetLine[];
};

const CONFIDENCE_GROUP_ORDER: (Confidence | null)[] = ["high", "medium", "low", null];

function byCategoryThenDescription(a: BudgetLine, b: BudgetLine): number {
  return a.category.localeCompare(b.category) || a.description.localeCompare(b.description);
}

/**
 * What a scenario's budget is built on, and how solid it is -- the
 * Scenario Overview page's last two blocks. Only rearranges what's
 * stored: a line whose source id doesn't resolve to a known source is
 * counted as unsourced rather than shown with a guessed one.
 */
export function summarizeBudgetEvidence(budgetLines: BudgetLine[], sources: Source[]): BudgetEvidence {
  const lines = [...budgetLines].sort(byCategoryThenDescription);
  const sourcesById = new Map(sources.map((source) => [source.id, source]));

  const sourced: SourcedLine[] = [];
  const unsourced: BudgetLine[] = [];
  for (const line of lines) {
    const source = line.sourceId ? sourcesById.get(line.sourceId) : undefined;
    if (source) sourced.push({ line, source });
    else unsourced.push(line);
  }

  return {
    sourced,
    unsourced,
    byState: INFO_STATE_ORDER.map((state) => ({
      state,
      lines: lines.filter((line) => line.informationState === state),
    })).filter((group) => group.lines.length > 0),
    byConfidence: CONFIDENCE_GROUP_ORDER.map((confidence) => ({
      confidence,
      lines: lines.filter((line) => line.confidence === confidence),
    })).filter((group) => group.lines.length > 0),
    lowConfidence: lines.filter((line) => line.confidence === "low"),
  };
}
