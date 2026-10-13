import * as fixtures from "./fixtures";
import type { DataSource } from "./types";

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
};
