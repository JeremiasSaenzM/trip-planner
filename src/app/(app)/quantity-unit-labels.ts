import type { QuantityUnit } from "@/lib/domain/types";

// Shared between the budget-line write forms, BudgetLineRow's unit
// amount, and the import review screen's formatted proposal values.
export const QUANTITY_UNIT_LABELS: Record<QuantityUnit, string> = {
  night: "night",
  day: "day",
  person: "person",
  item: "item",
};

export const QUANTITY_UNIT_ORDER: QuantityUnit[] = ["night", "day", "person", "item"];
