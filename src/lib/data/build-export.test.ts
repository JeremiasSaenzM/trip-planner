import { describe, expect, it } from "vitest";

import { buildExportPayload, EXPORT_SCHEMA_VERSION } from "./build-export";
import * as fixtures from "./fixtures";

describe("buildExportPayload", () => {
  it("wraps every table under data, with an exportedAt and schemaVersion", () => {
    const result = buildExportPayload({
      exportedAt: "2026-10-15T12:00:00.000Z",
      trips: fixtures.trips,
      competitions: fixtures.competitions,
      scenarios: fixtures.scenarios,
      sources: fixtures.sources,
      budgetLines: fixtures.budgetLines,
      payments: fixtures.payments,
      savingsEntries: fixtures.savingsEntries,
      fxRates: fixtures.fxRates,
      decisions: fixtures.decisions,
      openItems: fixtures.openItems,
      flightOptions: fixtures.flightOptions,
      flightSegments: fixtures.flightSegments,
      stays: fixtures.stays,
      movements: fixtures.movements,
      proposalBatches: fixtures.proposalBatches,
      proposalItems: fixtures.proposalItems,
      changeLog: fixtures.changeLog,
    });

    expect(result.exportedAt).toBe("2026-10-15T12:00:00.000Z");
    expect(result.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    // Pinned: stays and movements (Phase 6.4) changed the exported
    // shape, so this has to have moved past 5.
    expect(EXPORT_SCHEMA_VERSION).toBe(6);
    expect(result.data.trips).toBe(fixtures.trips);
    expect(result.data.changeLog).toBe(fixtures.changeLog);
    expect(Object.keys(result.data)).toEqual([
      "trips",
      "competitions",
      "scenarios",
      "sources",
      "budgetLines",
      "payments",
      "savingsEntries",
      "fxRates",
      "decisions",
      "openItems",
      "flightOptions",
      "flightSegments",
      "stays",
      "movements",
      "proposalBatches",
      "proposalItems",
      "changeLog",
    ]);
  });

  it("round-trips through JSON cleanly", () => {
    const result = buildExportPayload({
      exportedAt: "2026-10-15T12:00:00.000Z",
      trips: fixtures.trips,
      competitions: [],
      scenarios: [],
      sources: [],
      budgetLines: [],
      payments: [],
      savingsEntries: [],
      fxRates: [],
      decisions: [],
      openItems: [],
      flightOptions: [],
      flightSegments: [],
      stays: [],
      movements: [],
      proposalBatches: [],
      proposalItems: [],
      changeLog: [],
    });

    const parsed = JSON.parse(JSON.stringify(result));
    expect(parsed.data.trips).toEqual(fixtures.trips);
    expect(parsed.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
  });

  it("still produces a valid payload when every table is empty", () => {
    const result = buildExportPayload({
      exportedAt: "2026-10-15T12:00:00.000Z",
      trips: [],
      competitions: [],
      scenarios: [],
      sources: [],
      budgetLines: [],
      payments: [],
      savingsEntries: [],
      fxRates: [],
      decisions: [],
      openItems: [],
      flightOptions: [],
      flightSegments: [],
      stays: [],
      movements: [],
      proposalBatches: [],
      proposalItems: [],
      changeLog: [],
    });

    expect(result.exportedAt).toBe("2026-10-15T12:00:00.000Z");
    expect(result.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    for (const table of Object.values(result.data)) {
      expect(table).toEqual([]);
    }
  });
});
