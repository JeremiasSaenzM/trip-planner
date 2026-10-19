import type { Confidence } from "@/lib/domain/types";

// The planning system's own definitions (07 §8), spelled out in the
// picker so the choice never depends on remembering what "medium"
// meant. Short names are for the budget-line list, where there's no
// room for the full sentence.
export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const CONFIDENCE_DESCRIPTIONS: Record<Confidence, string> = {
  high: "High — confirmed price or purchase",
  medium: "Medium — several current observations or strong history",
  low: "Low — mostly estimates",
};

export const CONFIDENCE_ORDER: Confidence[] = ["high", "medium", "low"];

// budget_lines.confidence is nullable: a line that hasn't been assessed
// yet says so, rather than reading as a silent "low".
export const CONFIDENCE_NOT_ASSESSED = "Not assessed";

export function confidenceLabel(confidence: Confidence | null): string {
  return confidence ? CONFIDENCE_LABELS[confidence] : CONFIDENCE_NOT_ASSESSED;
}
