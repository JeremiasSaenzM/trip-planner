import type {
  BudgetLine,
  ChangeLogEntry,
  Competition,
  Decision,
  FlightOption,
  FlightSegment,
  FxRate,
  OpenItem,
  Payment,
  ProposalBatch,
  ProposalItem,
  SavingsEntry,
  Scenario,
  Source,
  Trip,
} from "./types";

// Bumped whenever the shape of ExportPayload["data"] changes, so a
// future import (not built yet -- see CLAUDE.md's Phase 5 note) knows
// whether it's reading something it understands.
//   2 -- budget lines gained confidence
//   3 -- a competition's city, country, dates and time zone can be null
//   4 -- proposalBatches and proposalItems (imported research)
export const EXPORT_SCHEMA_VERSION = 4;

export type ExportPayload = {
  exportedAt: string;
  schemaVersion: number;
  data: {
    trips: Trip[];
    competitions: Competition[];
    scenarios: Scenario[];
    sources: Source[];
    budgetLines: BudgetLine[];
    payments: Payment[];
    savingsEntries: SavingsEntry[];
    fxRates: FxRate[];
    decisions: Decision[];
    openItems: OpenItem[];
    flightOptions: FlightOption[];
    flightSegments: FlightSegment[];
    proposalBatches: ProposalBatch[];
    proposalItems: ProposalItem[];
    changeLog: ChangeLogEntry[];
  };
};

export type BuildExportPayloadInput = {
  /** ISO instant -- passed in rather than read with `new Date()` here,
   * so this stays a pure function the same way everything in
   * src/lib/domain/ is. */
  exportedAt: string;
} & ExportPayload["data"];

/**
 * Wraps every table the person owns into one JSON-serializable payload:
 * every write path in the app (real.ts) and demo mode (demo.ts) both
 * already return these exact row shapes from their own getters, so
 * there's nothing demo-specific to branch on here -- this works
 * unchanged against either one.
 */
export function buildExportPayload(input: BuildExportPayloadInput): ExportPayload {
  const { exportedAt, ...data } = input;
  return {
    exportedAt,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    data,
  };
}
