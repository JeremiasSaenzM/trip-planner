import { assertWritesAllowed } from "@/lib/demo-mode";

import * as fixtures from "./fixtures";
import type { DataSource } from "./types";

// demoDataSource only ever runs while isDemoMode() is true (that's the
// one switch in ./index.ts), so assertWritesAllowed() always throws here
// -- the throw after it is dead code at runtime, there only because
// TypeScript can't see that assertWritesAllowed() is unconditional in
// this particular caller, and still needs every path to return or throw.
function writesDisabledInDemoMode(): never {
  assertWritesAllowed();
  throw new Error("unreachable: assertWritesAllowed() always throws in demo mode");
}

// Demo implementation: returns the same typed fixture data every time,
// wrapped in a resolved promise so its signatures match ./real exactly.
export const demoDataSource: DataSource = {
  getTrips: async () => fixtures.trips,
  getSources: async () => fixtures.sources,
  getCompetitions: async () => fixtures.competitions,
  getScenarios: async () => fixtures.scenarios,
  getDecisions: async () => fixtures.decisions,
  getBudgetLines: async () => fixtures.budgetLines,
  getPayments: async () => fixtures.payments,
  getSavingsEntries: async () => fixtures.savingsEntries,
  getFxRates: async () => fixtures.fxRates,
  getOpenItems: async () => fixtures.openItems,
  getFlightOptions: async () => fixtures.flightOptions,
  getFlightSegments: async () => fixtures.flightSegments,
  getChangeLog: async () => fixtures.changeLog,
  getProposalBatches: async () => fixtures.proposalBatches,
  getProposalItems: async () => fixtures.proposalItems,
  createTrip: async () => writesDisabledInDemoMode(),
  createCompetition: async () => writesDisabledInDemoMode(),
  updateCompetition: async () => writesDisabledInDemoMode(),
  createScenario: async () => writesDisabledInDemoMode(),
  updateScenario: async () => writesDisabledInDemoMode(),
  deleteScenario: async () => writesDisabledInDemoMode(),
  recordSavingsEntry: async () => writesDisabledInDemoMode(),
  updateSavingsEntry: async () => writesDisabledInDemoMode(),
  deleteSavingsEntry: async () => writesDisabledInDemoMode(),
  createPayment: async () => writesDisabledInDemoMode(),
  recordPayment: async () => writesDisabledInDemoMode(),
  updatePaymentStatus: async () => writesDisabledInDemoMode(),
  updatePaymentDetails: async () => writesDisabledInDemoMode(),
  deletePayment: async () => writesDisabledInDemoMode(),
  createPaymentRiskDecision: async () => writesDisabledInDemoMode(),
  createSource: async () => writesDisabledInDemoMode(),
  createBudgetLine: async () => writesDisabledInDemoMode(),
  updateBudgetLine: async () => writesDisabledInDemoMode(),
  deleteBudgetLine: async () => writesDisabledInDemoMode(),
  createFxRate: async () => writesDisabledInDemoMode(),
  updateFxRate: async () => writesDisabledInDemoMode(),
  createProposalBatch: async () => writesDisabledInDemoMode(),
  approveProposal: async () => writesDisabledInDemoMode(),
  rejectProposal: async () => writesDisabledInDemoMode(),
  closeProposalBatch: async () => writesDisabledInDemoMode(),
};
