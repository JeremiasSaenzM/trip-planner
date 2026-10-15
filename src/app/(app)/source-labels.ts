// Mirrors sources_tier_range (tier between 1 and 6) -- shared between
// SourcePicker's "add a new source" tier select and anywhere a source's
// tier needs to show as words rather than a bare number.
export const SOURCE_TIER_LABELS: Record<number, string> = {
  1: "Official",
  2: "Operational / booking engine",
  3: "Aggregator",
  4: "Secondary",
  5: "Community",
  6: "Model estimate",
};

export const SOURCE_TIER_ORDER = [1, 2, 3, 4, 5, 6];
