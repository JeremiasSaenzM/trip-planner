import type { BudgetCategory } from "@/lib/domain/types";

// Shared between charts.tsx (the "Budget by category" bars) and the
// payment write forms (the category picker for a new budget line).
export const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  A: "Competition",
  B: "Transport",
  C: "Lodging",
  D: "Local transit",
  E: "Food",
  F: "Activities",
  G: "Connectivity",
  H: "Insurance",
  I: "Pre-trip",
  J: "Contingency",
};

export const CATEGORY_ORDER: BudgetCategory[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
