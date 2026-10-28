import { afterEach, describe, expect, it, vi } from "vitest";

import { rollUpBudgetByScenario } from "@/lib/domain/roll-up-budget-by-scenario";

import { demoDataSource } from "./demo";
import { budgetLines, savingsEntries } from "./fixtures";

afterEach(() => {
  vi.unstubAllEnvs();
});

// These fixtures are never special-cased by domain code: they go through
// rollUpBudgetByScenario() exactly as real Supabase rows would, because
// BudgetLine/FxRate here are structurally compatible with its input
// types (same field names, same types, just a few extra columns).
describe("demo fixtures through the domain layer", () => {
  it("roll up cleanly, with every currency covered by a rate", async () => {
    const source = demoDataSource;
    const [lines, rates] = await Promise.all([source.getBudgetLines(), source.getFxRates()]);

    const result = rollUpBudgetByScenario({
      tripId: "20000000-0000-0000-0000-000000000001",
      scenarioId: "50000000-0000-0000-0000-000000000001",
      asOfDate: "2026-10-10",
      budgetLines: lines,
      rates,
    });

    expect(result.missingRates).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.totals.target).toBeGreaterThan(0);
  });

  it("use a mix of EUR, GBP and USD so conversion is visible", () => {
    const currencies = new Set(budgetLines.map((line) => line.currency));
    expect(currencies).toEqual(new Set(["EUR", "GBP", "USD"]));
  });

  it("record savings only in USD", () => {
    expect(savingsEntries.every((entry) => entry.currency === "USD")).toBe(true);
  });
});

describe("demoDataSource writes", () => {
  it("every create* method throws instead of writing to the fixtures", async () => {
    vi.stubEnv("DEMO_MODE", "true");

    await expect(demoDataSource.createTrip({ name: "Test" })).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.createCompetition({
        tripId: "20000000-0000-0000-0000-000000000001",
        name: "Test",
        city: "Test",
        country: "Test",
        startDate: "2027-01-01",
        endDate: "2027-01-02",
        timezone: "UTC",
        datesState: "pending",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.createScenario({
        tripId: "20000000-0000-0000-0000-000000000001",
        name: "Test",
        includesExtension: false,
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.recordSavingsEntry({
        tripId: "20000000-0000-0000-0000-000000000001",
        amount: 100,
        recordedOn: "2026-01-01",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.updateSavingsEntry({
        id: "90000000-0000-0000-0000-000000000001",
        amount: 100,
        recordedOn: "2026-01-01",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.deleteSavingsEntry({
        id: "90000000-0000-0000-0000-000000000001",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.createPayment({
        tripId: "20000000-0000-0000-0000-000000000001",
        category: "A",
        description: "Test",
        currency: "USD",
        totalAmount: 100,
        refundability: "refundable",
        timingType: "due_on_date",
        competitionRelated: false,
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.recordPayment({
        paymentId: "80000000-0000-0000-0000-000000000001",
        amount: 50,
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.updatePaymentStatus({
        paymentId: "80000000-0000-0000-0000-000000000001",
        status: "committed",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.updatePaymentDetails({
        paymentId: "80000000-0000-0000-0000-000000000001",
        description: "Test",
        totalAmount: 100,
        currency: "USD",
        datesState: "estimate",
        timingType: "due_on_date",
        informationState: "estimate",
        refundability: "refundable",
        competitionRelated: false,
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.deletePayment({
        paymentId: "80000000-0000-0000-0000-000000000001",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.createPaymentRiskDecision({
        tripId: "20000000-0000-0000-0000-000000000001",
        competitionId: "40000000-0000-0000-0000-000000000001",
        paymentId: "80000000-0000-0000-0000-000000000001",
        paymentDescription: "Test",
        rationale: "Test",
        acceptedAmount: 100,
        acceptedCurrency: "USD",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.createSource({
        provider: "Test",
        tier: 1,
        observedOn: "2026-01-01",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.createBudgetLine({
        tripId: "20000000-0000-0000-0000-000000000001",
        category: "A",
        description: "Test",
        amountMin: 100,
        amountTarget: 100,
        amountConservative: 100,
        currency: "USD",
        informationState: "estimate",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.updateBudgetLine({
        id: "70000000-0000-0000-0000-000000000001",
        category: "A",
        description: "Test",
        amountMin: 100,
        amountTarget: 100,
        amountConservative: 100,
        currency: "USD",
        informationState: "estimate",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.deleteBudgetLine({
        id: "70000000-0000-0000-0000-000000000001",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.createFxRate({
        currency: "EUR",
        rateToUsd: 1.1,
        rateDate: "2026-01-01",
        rateKind: "planning_base",
        informationState: "estimate",
        sourceId: "30000000-0000-0000-0000-000000000006",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.updateFxRate({
        id: "a0000000-0000-0000-0000-000000000001",
        currency: "EUR",
        rateToUsd: 1.1,
        rateDate: "2026-01-01",
        rateKind: "planning_base",
        informationState: "estimate",
        sourceId: "30000000-0000-0000-0000-000000000006",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.createStay({
        scenarioId: "50000000-0000-0000-0000-000000000001",
        locationId: "f4000000-0000-0000-0000-000000000001",
        startDate: "2027-01-01",
        nights: 1,
        kind: "independent",
        informationState: "estimate",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.updateStay({
        id: "f2000000-0000-0000-0000-000000000001",
        locationId: "f4000000-0000-0000-0000-000000000001",
        startDate: "2027-01-01",
        nights: 1,
        kind: "independent",
        informationState: "estimate",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.deleteStay({
        id: "f2000000-0000-0000-0000-000000000001",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.createMovement({
        scenarioId: "50000000-0000-0000-0000-000000000001",
        sequence: 1,
        fromLocationId: "f4000000-0000-0000-0000-000000000001",
        toLocationId: "f4000000-0000-0000-0000-000000000001",
        departDate: "2027-01-01",
        arriveDate: "2027-01-01",
        mode: "plane",
        informationState: "estimate",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.updateMovement({
        id: "f3000000-0000-0000-0000-000000000001",
        sequence: 1,
        fromLocationId: "f4000000-0000-0000-0000-000000000001",
        toLocationId: "f4000000-0000-0000-0000-000000000001",
        departDate: "2027-01-01",
        arriveDate: "2027-01-01",
        mode: "plane",
        informationState: "estimate",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.deleteMovement({
        id: "f3000000-0000-0000-0000-000000000001",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(demoDataSource.createLocation({ name: "Test" })).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.updateLocation({
        id: "f4000000-0000-0000-0000-000000000001",
        name: "Test",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.deleteLocation({
        id: "f4000000-0000-0000-0000-000000000001",
        reason: "Test",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
  });
});
