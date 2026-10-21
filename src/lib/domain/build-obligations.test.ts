import { describe, expect, it } from "vitest";

import { calculateRequiredSavings } from "./calculate-required-savings";
import { rollUpBudgetByScenario, type BudgetLineForRollup } from "./roll-up-budget-by-scenario";
import { buildObligations, type BudgetLineForObligations, type PaymentForObligations } from "./build-obligations";

const DEPARTURE = "2027-07-05";

describe("buildObligations", () => {
  it("does not double-count a budget line that's fully covered by its own payment", () => {
    const payments: PaymentForObligations[] = [
      {
        budgetLineId: "L1",
        description: "Hotel payment",
        totalAmount: 500,
        paidAmount: 0,
        currency: "USD",
        dueDate: "2027-06-01",
        status: "committed",
      },
    ];

    const result = buildObligations({
      payments,
      allTripPayments: payments,
      budgetLines: [{ id: "L1", description: "Hotel", amountMin: 500, amountTarget: 500, amountConservative: 500, currency: "USD" }],
      savingsEntries: [],
      rates: [],
      departureDate: DEPARTURE,
      departureDateConfirmed: true,
      asOfDate: "2027-01-01",
    });

    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.obligations).toHaveLength(1);
    expect(result.obligations[0]).toMatchObject({ description: "Hotel payment", amountTargetUsd: 500 });
  });

  it("reduces availableUsd by what's already been paid", () => {
    const payments: PaymentForObligations[] = [
      {
        budgetLineId: "L1",
        description: "Registration",
        totalAmount: 300,
        paidAmount: 200,
        currency: "USD",
        dueDate: "2027-02-01",
        status: "committed",
      },
    ];

    const result = buildObligations({
      payments,
      allTripPayments: payments,
      budgetLines: [
        { id: "L1", description: "Registration", amountMin: 300, amountTarget: 300, amountConservative: 300, currency: "USD" },
      ],
      savingsEntries: [{ amountUsd: 1000, recordedOn: "2027-01-01" }],
      rates: [],
      departureDate: DEPARTURE,
      departureDateConfirmed: true,
      asOfDate: "2027-01-01",
    });

    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.availableUsd).toBe(800);
  });

  it("pins a payment with no due date to departure, flagged as estimated and not clamped", () => {
    const payments: PaymentForObligations[] = [
      {
        budgetLineId: "L1",
        description: "Final balance",
        totalAmount: 400,
        paidAmount: 0,
        currency: "USD",
        dueDate: null,
        status: "committed",
      },
    ];

    const result = buildObligations({
      payments,
      allTripPayments: payments,
      budgetLines: [
        { id: "L1", description: "Final balance", amountMin: 400, amountTarget: 400, amountConservative: 400, currency: "USD" },
      ],
      savingsEntries: [],
      rates: [],
      departureDate: DEPARTURE,
      departureDateConfirmed: true,
      asOfDate: "2027-01-01",
    });

    if (result.status !== "ready") throw new Error("expected ready");
    const obligation = result.obligations.find((o) => o.description === "Final balance");
    expect(obligation).toMatchObject({ dueDate: DEPARTURE, isEstimatedDueDate: true, clampedToDeparture: false });
  });

  it("converts a GBP payment and a EUR budget line correctly, each at the matching planning rate", () => {
    const rates = [
      { currency: "GBP", rateToUsd: 1.3, rateDate: "2027-01-01", rateKind: "planning_base" as const },
      { currency: "GBP", rateToUsd: 1.35, rateDate: "2027-01-01", rateKind: "planning_conservative" as const },
      { currency: "EUR", rateToUsd: 1.1, rateDate: "2027-01-01", rateKind: "planning_base" as const },
      { currency: "EUR", rateToUsd: 1.15, rateDate: "2027-01-01", rateKind: "planning_conservative" as const },
    ];
    const payments: PaymentForObligations[] = [
      {
        budgetLineId: "L1",
        description: "Flight",
        totalAmount: 600,
        paidAmount: 0,
        currency: "GBP",
        dueDate: "2027-03-01",
        status: "committed",
      },
    ];

    const result = buildObligations({
      payments,
      allTripPayments: payments,
      budgetLines: [
        { id: "L1", description: "Flight", amountMin: 600, amountTarget: 600, amountConservative: 600, currency: "GBP" },
        { id: "L2", description: "Hotel", amountMin: 400, amountTarget: 400, amountConservative: 500, currency: "EUR" },
      ],
      savingsEntries: [],
      rates,
      departureDate: DEPARTURE,
      departureDateConfirmed: true,
      asOfDate: "2027-01-15",
    });

    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.missingRates).toEqual([]);
    // Flight: fully covered by its own payment, no separate line obligation.
    expect(result.obligations.filter((o) => o.description.startsWith("Flight"))).toHaveLength(1);

    const flight = result.obligations.find((o) => o.description === "Flight")!;
    expect(flight.amountTargetUsd).toBeCloseTo(600 * 1.3, 5);
    expect(flight.amountConservativeUsd).toBeCloseTo(600 * 1.35, 5);

    const hotel = result.obligations.find((o) => o.description.startsWith("Hotel"))!;
    expect(hotel.amountTargetUsd).toBeCloseTo(400 * 1.1, 5);
    expect(hotel.amountConservativeUsd).toBeCloseTo(500 * 1.15, 5);
  });

  it("marks every figure provisional when the departure date isn't confirmed, and refuses to compute with no competition at all", () => {
    const base = {
      payments: [] as PaymentForObligations[],
      allTripPayments: [] as PaymentForObligations[],
      budgetLines: [] as BudgetLineForObligations[],
      savingsEntries: [],
      rates: [],
      asOfDate: "2027-01-01",
    };

    const provisional = buildObligations({ ...base, departureDate: DEPARTURE, departureDateConfirmed: false });
    if (provisional.status !== "ready") throw new Error("expected ready");
    expect(provisional.provisional).toBe(true);

    const noCompetition = buildObligations({ ...base, departureDate: null, departureDateConfirmed: false });
    expect(noCompetition.status).toBe("no_departure_date");
  });

  it("still reports availableUsd with no departure date -- money set aside isn't $0 just because dates are missing", () => {
    const result = buildObligations({
      payments: [],
      allTripPayments: [
        {
          budgetLineId: "L1",
          description: "Deposit",
          totalAmount: 300,
          paidAmount: 100,
          currency: "USD",
          dueDate: null,
          status: "paid",
        },
      ],
      budgetLines: [],
      savingsEntries: [{ amountUsd: 500, recordedOn: "2026-12-01" }],
      rates: [],
      departureDate: null,
      departureDateConfirmed: false,
      asOfDate: "2027-01-01",
    });

    expect(result).toEqual({ status: "no_departure_date", availableUsd: 400, missingRates: [] });
  });

  it("clamps a pay-at-property payment due after departure, raising the monthly requirement vs. its original date", () => {
    const payments: PaymentForObligations[] = [
      {
        budgetLineId: "L1",
        description: "Hotel balance (pay at property)",
        totalAmount: 800,
        paidAmount: 0,
        currency: "USD",
        dueDate: "2027-07-10", // the festival runs 2027-07-05..11; this is during the trip
        status: "committed",
      },
    ];

    const result = buildObligations({
      payments,
      allTripPayments: payments,
      budgetLines: [{ id: "L1", description: "Hotel", amountMin: 800, amountTarget: 800, amountConservative: 800, currency: "USD" }],
      savingsEntries: [],
      rates: [],
      departureDate: DEPARTURE,
      departureDateConfirmed: true,
      asOfDate: "2027-01-01",
    });

    if (result.status !== "ready") throw new Error("expected ready");
    const obligation = result.obligations.find((o) => o.description.startsWith("Hotel balance"))!;
    expect(obligation).toMatchObject({ dueDate: DEPARTURE, clampedToDeparture: true });

    const clamped = calculateRequiredSavings({
      asOfDate: "2027-01-01",
      savingsEntries: [],
      obligations: [obligation],
    });
    const unclamped = calculateRequiredSavings({
      asOfDate: "2027-01-01",
      savingsEntries: [],
      obligations: [{ ...obligation, dueDate: "2027-07-10" }],
    });

    expect(clamped.bindingRequirement.target).toBeGreaterThan(unclamped.bindingRequirement.target);
  });

  it("satisfies (sum of obligations) - availableUsd === (scenario total) - (total savings), per basis", () => {
    // Paid amounts are USD on purpose: availableUsd converts paid amounts
    // at the observed rate while obligations convert unpaid amounts at a
    // planning rate, so a non-USD paid amount would make the two sides
    // diverge by whatever those two rates differ by. USD sidesteps that
    // (convertToUsd treats USD as rate 1 regardless of rateKind) while
    // GBP below still exercises real conversion for the unpaid side.
    const rates = [
      { currency: "GBP", rateToUsd: 1.3, rateDate: "2027-01-01", rateKind: "planning_base" as const },
      { currency: "GBP", rateToUsd: 1.35, rateDate: "2027-01-01", rateKind: "planning_conservative" as const },
    ];
    const budgetLines: BudgetLineForObligations[] = [
      { id: "L1", description: "Flight", amountMin: 600, amountTarget: 600, amountConservative: 650, currency: "USD" },
      { id: "L2", description: "Hotel", amountMin: 400, amountTarget: 400, amountConservative: 450, currency: "GBP" },
    ];
    const payments: PaymentForObligations[] = [
      {
        budgetLineId: "L1",
        description: "Flight deposit",
        totalAmount: 600,
        paidAmount: 200,
        currency: "USD",
        dueDate: "2027-03-01",
        status: "committed",
      },
    ];
    const savingsEntries = [{ amountUsd: 1000, recordedOn: "2027-01-01" }];

    const obligationsResult = buildObligations({
      payments,
      allTripPayments: payments,
      budgetLines,
      savingsEntries,
      rates,
      departureDate: DEPARTURE,
      departureDateConfirmed: true,
      asOfDate: "2027-01-15",
    });
    if (obligationsResult.status !== "ready") throw new Error("expected ready");

    const rollup = rollUpBudgetByScenario({
      tripId: "T1",
      scenarioId: "S1",
      asOfDate: "2027-01-15",
      rates,
      budgetLines: budgetLines.map(
        (line): BudgetLineForRollup => ({
          tripId: "T1",
          scenarioId: "S1",
          category: "B",
          amountMin: line.amountTarget,
          amountTarget: line.amountTarget,
          amountConservative: line.amountConservative,
          currency: line.currency,
          informationState: "estimate",
        }),
      ),
    });

    const totalSavings = savingsEntries.reduce((sum, e) => sum + e.amountUsd, 0);
    const sumObligations = (basis: "amountTargetUsd" | "amountConservativeUsd") =>
      obligationsResult.obligations.reduce((sum, o) => sum + o[basis], 0);

    expect(sumObligations("amountTargetUsd") - obligationsResult.availableUsd).toBeCloseTo(
      rollup.totals.target - totalSavings,
      5,
    );
    expect(sumObligations("amountConservativeUsd") - obligationsResult.availableUsd).toBeCloseTo(
      rollup.totals.conservative - totalSavings,
      5,
    );
  });

  it("still reduces availableUsd for a cancelled payment's already-paid amount, but creates no obligation for it", () => {
    const payments: PaymentForObligations[] = [
      {
        budgetLineId: "L1",
        description: "Cancelled flight",
        totalAmount: 500,
        paidAmount: 150,
        currency: "USD",
        dueDate: "2027-03-01",
        status: "cancelled",
      },
    ];

    const result = buildObligations({
      payments,
      allTripPayments: payments,
      budgetLines: [{ id: "L1", description: "Flight", amountMin: 500, amountTarget: 500, amountConservative: 500, currency: "USD" }],
      savingsEntries: [{ amountUsd: 1000, recordedOn: "2027-01-01" }],
      rates: [],
      departureDate: DEPARTURE,
      departureDateConfirmed: true,
      asOfDate: "2027-01-01",
    });

    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.availableUsd).toBe(850);
    expect(result.obligations.some((o) => o.description === "Cancelled flight")).toBe(false);
  });
});

describe("buildObligations at the minimum basis", () => {
  const base = {
    savingsEntries: [],
    departureDate: DEPARTURE,
    departureDateConfirmed: true,
    asOfDate: "2027-01-15",
  };
  const rates = [
    { currency: "EUR", rateToUsd: 1.1, rateDate: "2027-01-01", rateKind: "planning_base" as const },
    { currency: "EUR", rateToUsd: 1.15, rateDate: "2027-01-01", rateKind: "planning_conservative" as const },
  ];

  it("takes a line's unallocated remainder from its amountMin, at the planning_base rate", () => {
    const result = buildObligations({
      ...base,
      payments: [],
      allTripPayments: [],
      budgetLines: [{ id: "L1", description: "Hotel", amountMin: 300, amountTarget: 400, amountConservative: 500, currency: "EUR" }],
      rates,
    });
    if (result.status !== "ready") throw new Error("expected ready");
    const hotel = result.obligations[0];
    expect(hotel.amountMinimumUsd).toBeCloseTo(300 * 1.1, 5);
    expect(hotel.amountTargetUsd).toBeCloseTo(400 * 1.1, 5);
    expect(hotel.amountConservativeUsd).toBeCloseTo(500 * 1.15, 5);
  });

  it("counts a payment at its real remaining amount: a quote, not a projection", () => {
    const payments: PaymentForObligations[] = [
      { budgetLineId: "L1", description: "Flight", totalAmount: 600, paidAmount: 100, currency: "EUR", dueDate: "2027-03-01", status: "committed" },
    ];
    const result = buildObligations({
      ...base,
      payments,
      allTripPayments: payments,
      budgetLines: [{ id: "L1", description: "Flight", amountMin: 500, amountTarget: 600, amountConservative: 700, currency: "EUR" }],
      rates,
    });
    if (result.status !== "ready") throw new Error("expected ready");
    const flight = result.obligations.find((o) => o.description === "Flight")!;
    expect(flight.amountMinimumUsd).toBeCloseTo(500 * 1.1, 5);
    expect(flight.amountMinimumUsd).toBe(flight.amountTargetUsd);
  });

  it("never goes below zero when a line's payments already exceed its minimum, while target still has a remainder", () => {
    const payments: PaymentForObligations[] = [
      { budgetLineId: "L1", description: "Deposit", totalAmount: 350, paidAmount: 0, currency: "USD", dueDate: "2027-03-01", status: "committed" },
    ];
    const result = buildObligations({
      ...base,
      payments,
      allTripPayments: payments,
      budgetLines: [{ id: "L1", description: "Hotel", amountMin: 300, amountTarget: 400, amountConservative: 500, currency: "USD" }],
      rates: [],
    });
    if (result.status !== "ready") throw new Error("expected ready");
    const remainder = result.obligations.find((o) => o.description === "Hotel (unallocated)")!;
    expect(remainder).toMatchObject({ amountMinimumUsd: 0, amountTargetUsd: 50, amountConservativeUsd: 150 });
  });

  it("satisfies (sum of obligations) - availableUsd === (scenario total) - (total savings) at the minimum too", () => {
    const budgetLines: BudgetLineForObligations[] = [
      { id: "L1", description: "Flight", amountMin: 500, amountTarget: 600, amountConservative: 650, currency: "USD" },
      { id: "L2", description: "Hotel", amountMin: 300, amountTarget: 400, amountConservative: 450, currency: "EUR" },
    ];
    // Under the line's minimum, so its remainder isn't clamped at zero.
    const payments: PaymentForObligations[] = [
      { budgetLineId: "L1", description: "Flight deposit", totalAmount: 450, paidAmount: 200, currency: "USD", dueDate: "2027-03-01", status: "committed" },
    ];
    const savingsEntries = [{ amountUsd: 1000, recordedOn: "2027-01-01" }];

    const obligationsResult = buildObligations({ ...base, payments, allTripPayments: payments, budgetLines, savingsEntries, rates });
    if (obligationsResult.status !== "ready") throw new Error("expected ready");

    const rollup = rollUpBudgetByScenario({
      tripId: "T1",
      scenarioId: "S1",
      asOfDate: base.asOfDate,
      rates,
      budgetLines: budgetLines.map(
        (line): BudgetLineForRollup => ({
          tripId: "T1",
          scenarioId: "S1",
          category: "B",
          amountMin: line.amountMin,
          amountTarget: line.amountTarget,
          amountConservative: line.amountConservative,
          currency: line.currency,
          informationState: "estimate",
        }),
      ),
    });

    const sumMinimum = obligationsResult.obligations.reduce((sum, o) => sum + o.amountMinimumUsd, 0);
    expect(sumMinimum - obligationsResult.availableUsd).toBeCloseTo(rollup.totals.min - 1000, 5);
  });
});
