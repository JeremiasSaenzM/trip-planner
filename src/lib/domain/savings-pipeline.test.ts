import { describe, expect, it } from "vitest";

import { buildDeadlinePots } from "./build-deadline-pots";
import { buildObligations, type BudgetLineForObligations, type PaymentForObligations } from "./build-obligations";
import { buildParallelSavingsPlan } from "./build-parallel-savings-plan";
import { buildPhasedSavingsPlan } from "./build-phased-savings-plan";
import { calculateRequiredSavings, cumulativeAt, requiredMonthlyAt } from "./calculate-required-savings";
import type { FxRate } from "./convert-to-usd";
import { resolveDepartureDate } from "./resolve-departure-date";
import { BASES } from "./types";

// The whole savings pipeline, end to end, the way dashboard-data.ts runs
// it: one set of obligations feeds the headline (calculateRequiredSavings),
// the phased and parallel plans, and the expanded pot list. These tests
// fail if any of them ever stops agreeing with the others about which
// payments are in the plan.
//
// Fictional amounts, shaped like a routing with money moving after the
// festival starts: an arrival city a few days early, a stay after the
// festival, and two payments with no due date at all.

const AS_OF = "2026-10-20";
const FESTIVAL_START = "2028-07-05";
const TRIP_DEPARTURE = "2028-07-02";

const RATES: FxRate[] = ["planning_base", "planning_conservative", "observed"].flatMap((rateKind) => [
  { currency: "GBP", rateKind: rateKind as FxRate["rateKind"], rateToUsd: rateKind === "planning_conservative" ? 1.35 : 1.25, rateDate: "2026-10-01" },
  { currency: "EUR", rateKind: rateKind as FxRate["rateKind"], rateToUsd: rateKind === "planning_conservative" ? 1.15 : 1.08, rateDate: "2026-10-01" },
]);

function payment(
  id: string,
  description: string,
  totalAmount: number,
  currency: string,
  dueDate: string | null,
  overrides: Partial<PaymentForObligations> = {},
): PaymentForObligations {
  return { id, budgetLineId: `L-${id}`, description, totalAmount, paidAmount: 0, currency, dueDate, status: "planned", ...overrides };
}

const PAYMENTS: PaymentForObligations[] = [
  payment("flights", "Flights", 1500, "USD", "2028-01-31"),
  payment("insurance", "Insurance", 100, "USD", "2028-04-30"),
  payment("arrival-night", "Arrival night", 80, "USD", "2028-07-01"),
  payment("festival-stay", "Festival stay (choir arrangement)", 300, "GBP", null),
  payment("competition-fee", "Competition fee", 40, "USD", null),
  payment("city-nights", "City nights after the festival", 900, "USD", "2028-07-10"),
  payment("city-transport", "City transport", 80, "EUR", "2028-07-12"),
  payment("deposit", "Deposit, part paid", 200, "USD", "2027-06-01", { paidAmount: 50, status: "committed" }),
  payment("cancelled", "Cancelled booking", 120, "USD", "2028-03-01", { status: "cancelled" }),
];

// One line per payment, each fully covered -- plus one with nothing
// booked against it yet, so the plan also carries an unallocated remainder.
const BUDGET_LINES: BudgetLineForObligations[] = [
  ...PAYMENTS.map((p) => ({
    id: p.budgetLineId,
    description: p.description,
    amountMin: p.totalAmount,
    amountTarget: p.totalAmount,
    amountConservative: p.totalAmount,
    currency: p.currency,
  })),
  { id: "L-food", description: "Food", amountMin: 300, amountTarget: 400, amountConservative: 550, currency: "USD" },
];

function runPipeline(departureDate: string) {
  const result = buildObligations({
    payments: PAYMENTS,
    allTripPayments: PAYMENTS,
    budgetLines: BUDGET_LINES,
    savingsEntries: [{ amountUsd: 600, recordedOn: "2026-09-01" }],
    rates: RATES,
    departureDate,
    departureDateConfirmed: false,
    asOfDate: AS_OF,
  });
  if (result.status !== "ready") throw new Error("expected ready");
  expect(result.missingRates).toEqual([]);

  const savings = calculateRequiredSavings({
    asOfDate: AS_OF,
    savingsEntries: [{ amountUsd: result.availableUsd, recordedOn: AS_OF }],
    obligations: result.obligations,
  });
  return { result, savings };
}

// Payments the plan must fund: not cancelled, with something still unpaid.
const FUNDABLE_PAYMENT_IDS = PAYMENTS.filter((p) => p.status !== "cancelled" && p.totalAmount > p.paidAmount)
  .map((p) => p.id)
  .sort();

describe("the savings pipeline: headline, schedule and pots agree on one payment set", () => {
  for (const basis of BASES) {
    it(`every fundable payment is in exactly one pot, and nothing else is (${basis})`, () => {
      const { result } = runPipeline(TRIP_DEPARTURE);
      const pots = buildDeadlinePots({ obligations: result.obligations, basis, asOfDate: AS_OF });

      const paymentIdsInPots = pots
        .flatMap((pot) => pot.items)
        .filter((item) => item.timing !== "unallocated")
        .map((item) => PAYMENTS.find((p) => p.description === item.description)!.id)
        .sort();
      expect(paymentIdsInPots).toEqual(FUNDABLE_PAYMENT_IDS);

      const obligationPaymentIds = result.obligations
        .flatMap((o) => (o.origin.kind === "payment" ? [o.origin.paymentId] : []))
        .sort();
      expect(obligationPaymentIds).toEqual(FUNDABLE_PAYMENT_IDS);
    });

    it(`the pots add up to the schedule's final cumulative total, and each pot to its own items (${basis})`, () => {
      const { result, savings } = runPipeline(TRIP_DEPARTURE);
      const pots = buildDeadlinePots({ obligations: result.obligations, basis, asOfDate: AS_OF });

      const potTotal = pots.reduce((sum, pot) => sum + pot.amountUsd, 0);
      expect(potTotal).toBeCloseTo(cumulativeAt(savings.schedule.at(-1)!, basis), 6);
      for (const pot of pots) {
        expect(pot.items.reduce((sum, item) => sum + item.amountUsd, 0)).toBeCloseTo(pot.amountUsd, 6);
      }
      expect(pots.map((pot) => pot.dueDate)).toEqual(savings.schedule.map((entry) => entry.dueDate));
    });

    it(`the headline is the tightest deadline's rate, and funds every pot by its date (${basis})`, () => {
      const { result, savings } = runPipeline(TRIP_DEPARTURE);
      const headline = savings.bindingRequirement[basis];

      const rates = savings.schedule.map((entry) => requiredMonthlyAt(entry, basis) ?? 0);
      expect(headline).toBeCloseTo(Math.max(...rates), 6);

      // Saving the headline every month reaches each deadline's cumulative
      // total in time -- including the last one, which holds everything.
      for (const entry of savings.schedule) {
        expect(result.availableUsd + headline * entry.monthsUntil!).toBeGreaterThanOrEqual(
          cumulativeAt(entry, basis) - 1e-6,
        );
      }
    });

    it(`the phased and parallel plans plan for the same total as the pots (${basis})`, () => {
      const { result } = runPipeline(TRIP_DEPARTURE);
      const pots = buildDeadlinePots({ obligations: result.obligations, basis, asOfDate: AS_OF });
      const potTotal = pots.reduce((sum, pot) => sum + pot.amountUsd, 0);

      const common = { obligations: result.obligations, availableUsd: result.availableUsd, asOfDate: AS_OF, basis };
      const parallel = buildParallelSavingsPlan(common);
      const phased = buildPhasedSavingsPlan(common);

      expect(parallel.pots.reduce((sum, pot) => sum + pot.amountUsd, 0)).toBeCloseTo(potTotal, 6);
      expect(parallel.pots.map((pot) => pot.dueDate)).toEqual(pots.map((pot) => pot.dueDate));
      expect(phased.phases.map((phase) => phase.toDate)).toEqual(pots.map((pot) => pot.dueDate));
    });
  }
});

describe("payments due after departure, and payments with no due date", () => {
  it("moves a payment due after departure into the departure pot, keeping its own date and amount", () => {
    const { result } = runPipeline(TRIP_DEPARTURE);
    const pots = buildDeadlinePots({ obligations: result.obligations, basis: "target", asOfDate: AS_OF });
    const departurePot = pots.find((pot) => pot.dueDate === TRIP_DEPARTURE)!;

    expect(pots.at(-1)!.dueDate).toBe(TRIP_DEPARTURE);
    expect(departurePot.items).toContainEqual(
      expect.objectContaining({
        description: "City transport",
        originalAmount: 80,
        originalCurrency: "EUR",
        originalDueDate: "2028-07-12",
        timing: "moved_to_departure",
      }),
    );
    expect(departurePot.items).toContainEqual(
      expect.objectContaining({ description: "City nights after the festival", timing: "moved_to_departure" }),
    );
  });

  it("assumes an undated payment is due at departure, and says so", () => {
    const { result } = runPipeline(TRIP_DEPARTURE);
    const pots = buildDeadlinePots({ obligations: result.obligations, basis: "target", asOfDate: AS_OF });
    const departurePot = pots.find((pot) => pot.dueDate === TRIP_DEPARTURE)!;

    expect(departurePot.items).toContainEqual(
      expect.objectContaining({
        description: "Festival stay (choir arrangement)",
        originalAmount: 300,
        originalCurrency: "GBP",
        originalDueDate: null,
        timing: "undated",
      }),
    );
  });

  it("keeps a payment due before departure on its own date", () => {
    const { result } = runPipeline(TRIP_DEPARTURE);
    const pots = buildDeadlinePots({ obligations: result.obligations, basis: "target", asOfDate: AS_OF });

    expect(pots.find((pot) => pot.dueDate === "2028-07-01")!.items).toEqual([
      expect.objectContaining({ description: "Arrival night", timing: "on_date" }),
    ]);
  });

  it("lists the unpaid remainder of a part-paid payment, not its total", () => {
    const { result } = runPipeline(TRIP_DEPARTURE);
    const pots = buildDeadlinePots({ obligations: result.obligations, basis: "target", asOfDate: AS_OF });

    expect(pots.flatMap((pot) => pot.items)).toContainEqual(
      expect.objectContaining({ description: "Deposit, part paid", originalAmount: 150, amountUsd: 150 }),
    );
  });

  it("anchors on the trip's departure date when it's earlier than the festival start", () => {
    const departure = resolveDepartureDate({
      tripDepartureDate: TRIP_DEPARTURE,
      tripTravelDatesState: "estimate",
      competitionStartDate: FESTIVAL_START,
      competitionDatesState: "pending",
    })!;
    const fromTrip = runPipeline(departure.date);
    const fromFestival = runPipeline(FESTIVAL_START);

    expect(fromTrip.savings.schedule.at(-1)!.dueDate).toBe(TRIP_DEPARTURE);
    // Same money, three days less to save it in: never a lower requirement.
    expect(fromTrip.savings.bindingRequirement.target).toBeGreaterThanOrEqual(
      fromFestival.savings.bindingRequirement.target,
    );
    expect(cumulativeAt(fromTrip.savings.schedule.at(-1)!, "target")).toBeCloseTo(
      cumulativeAt(fromFestival.savings.schedule.at(-1)!, "target"),
      6,
    );
  });
});
