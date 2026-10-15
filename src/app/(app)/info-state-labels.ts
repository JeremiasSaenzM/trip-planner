import type { InfoState } from "@/lib/domain/types";

// Shared by every form that lets information_state be picked directly
// (budget lines, FX rates) -- CLAUDE.md's seven states, in the order a
// value is most likely to move through them day to day.
export const INFO_STATE_LABELS: Record<InfoState, string> = {
  estimate: "Estimate",
  assumption: "Assumption",
  pending: "Pending",
  decision: "Decision",
  confirmed: "Confirmed",
  historical: "Historical",
  conflicting: "Conflicting",
};

export const INFO_STATE_ORDER: InfoState[] = [
  "estimate",
  "assumption",
  "pending",
  "decision",
  "confirmed",
  "historical",
  "conflicting",
];
