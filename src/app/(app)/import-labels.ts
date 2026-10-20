import type { ProposalOp } from "@/lib/data/types";
import type { BudgetCategory, Confidence, InfoState } from "@/lib/domain/types";
import type { ReferenceLabel } from "@/lib/proposals/review";

import { CATEGORY_LABELS } from "./category-labels";
import { CONFIDENCE_LABELS, CONFIDENCE_NOT_ASSESSED } from "./confidence-labels";
import { INFO_STATE_LABELS } from "./info-state-labels";
import { REFUNDABILITY_LABELS, TIMING_LABELS } from "./payment-labels";

// Words for the /import review screen. Values are shown with the same
// labels the rest of the app uses (categories, information states, ...),
// so a proposal reads the way the row will once it's written.

export const OP_LABELS: Record<ProposalOp, string> = {
  create_source: "New source",
  create_competition: "New competition",
  create_scenario: "New scenario",
  create_budget_line: "New budget line",
  create_payment: "New payment",
  create_fx_rate: "New FX rate",
  update_competition: "Change competition",
  update_scenario: "Change scenario",
  update_budget_line: "Change budget line",
  update_payment: "Change payment",
  update_fx_rate: "Change FX rate",
  update_savings_entry: "Change savings entry",
};

const FIELD_LABELS: Record<string, string> = {
  provider: "Provider",
  tier: "Tier",
  url: "URL",
  observedOn: "Observation date",
  applicablePeriodStart: "Applies from",
  applicablePeriodEnd: "Applies until",
  notes: "Notes",
  note: "Note",
  name: "Name",
  city: "City",
  country: "Country",
  venue: "Venue",
  startDate: "Festival first day",
  endDate: "Festival final day",
  timezone: "Time zone",
  datesState: "Dates: information state",
  datesSource: "Dates: source",
  competition: "Competition",
  includesExtension: "Includes an extension",
  scenario: "Scenario",
  category: "Budget category",
  description: "Description",
  amountMin: "Minimum",
  amountTarget: "Target",
  amountConservative: "Conservative",
  currency: "Currency",
  informationState: "Information state",
  source: "Source",
  confidence: "Confidence",
  budgetLine: "Budget line",
  totalAmount: "Total amount",
  refundability: "Refundability",
  cancellationDeadline: "Cancellation deadline",
  timingType: "Timing",
  dueDate: "Due date",
  competitionRelated: "Tied to the competition",
  rateToUsd: "Rate to USD",
  rateDate: "Rate date",
  rateKind: "Rate kind",
  amount: "Amount (USD)",
  recordedOn: "Date",
};

const RATE_KIND_LABELS: Record<string, string> = {
  observed: "Observed",
  planning_base: "Planning (base)",
  planning_conservative: "Planning (conservative)",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function referenceText(label: ReferenceLabel | null | undefined): string {
  if (!label) return "None";
  switch (label.kind) {
    case "existing":
      return label.label;
    case "item":
      return `${label.label} (item ${label.position + 1} of this batch, ${label.status})`;
    case "unknown":
      return `Unknown (${label.id})`;
  }
}

export function formatProposalValue(field: string, value: unknown): string {
  if (value === null || value === undefined) {
    return field === "confidence" ? CONFIDENCE_NOT_ASSESSED : "None";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value !== "string") return String(value);

  switch (field) {
    case "category":
      return `${value} — ${CATEGORY_LABELS[value as BudgetCategory] ?? value}`;
    case "informationState":
    case "datesState":
      return INFO_STATE_LABELS[value as InfoState] ?? value;
    case "confidence":
      return CONFIDENCE_LABELS[value as Confidence] ?? value;
    case "refundability":
      return REFUNDABILITY_LABELS[value as keyof typeof REFUNDABILITY_LABELS] ?? value;
    case "timingType":
      return TIMING_LABELS[value as keyof typeof TIMING_LABELS] ?? value;
    case "rateKind":
      return RATE_KIND_LABELS[value] ?? value;
    default:
      return value;
  }
}
