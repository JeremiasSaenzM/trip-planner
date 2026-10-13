import { convertToUsd, type FxRate } from "./convert-to-usd";
import type { SavingsEntry } from "./calculate-required-savings";
import type { RateKind } from "./types";

export type PaymentForObligations = {
  budgetLineId: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  currency: string;
  /** YYYY-MM-DD, or null -- a payment with no due date yet. */
  dueDate: string | null;
  status: "planned" | "committed" | "paid" | "cancelled";
};

export type BudgetLineForObligations = {
  id: string;
  description: string;
  amountTarget: number;
  amountConservative: number;
  currency: string;
};

// Structurally a superset of calculate-required-savings's Obligation, so
// the caller can pass result.obligations straight into
// calculateRequiredSavings() without mapping -- same pattern as
// BudgetLineForRollup/FxRate elsewhere in this directory.
export type BuiltObligation = {
  description: string;
  amountTargetUsd: number;
  amountConservativeUsd: number;
  /** YYYY-MM-DD. Never after departureDate -- see clampedToDeparture. */
  dueDate: string;
  /** True when the source had no due date and this was set to departureDate. */
  isEstimatedDueDate: boolean;
  /** True when an explicit due date after departure was pulled back to it:
   * money needed during the trip must be saved before leaving. */
  clampedToDeparture: boolean;
};

export type MissingObligationRate = {
  description: string;
  currency: string;
  rateKind: RateKind;
};

export type BuildObligationsInput = {
  /** Scenario-scoped: the trip's shared (scenario_id null) payments plus
   * this scenario's own. Obligations (and the budget-line netting in
   * rule 4) are built only from these. */
  payments: PaymentForObligations[];
  /** Scenario-scoped the same way as payments. */
  budgetLines: BudgetLineForObligations[];
  /** Trip-level, every payment the trip has ever made across every
   * scenario -- "already paid" is a historical fact independent of
   * which scenario you're currently viewing, so it isn't re-scoped. */
  allTripPayments: PaymentForObligations[];
  /** Already USD. Trip-level, same reasoning as allTripPayments. */
  savingsEntries: SavingsEntry[];
  rates: FxRate[];
  /** YYYY-MM-DD, the scenario's competition's start_date (the first
   * official festival day) -- resolved by the caller. null if the
   * scenario has no competition yet. */
  departureDate: string | null;
  /** competition.dates_state === 'confirmed', resolved by the caller. */
  departureDateConfirmed: boolean;
  /** YYYY-MM-DD, "today" -- used only to convert already-paid amounts
   * (observed rate) and to filter which savings entries count so far.
   * Never used as a due date. */
  asOfDate: string;
};

export type BuildObligationsResult =
  | { status: "no_departure_date" }
  | {
      status: "ready";
      obligations: BuiltObligation[];
      /** Total savings minus total already paid (observed rate), across
       * every payment -- including cancelled ones, since that money is
       * already spent regardless of a later cancellation. */
      availableUsd: number;
      /** True when departureDateConfirmed is false. */
      provisional: boolean;
      missingRates: MissingObligationRate[];
    };

/**
 * Turns payments and budget lines into the Obligation[] shape
 * calculateRequiredSavings() needs, without double-counting: each
 * payment becomes an obligation for its own unpaid remainder; each
 * budget line adds a "due at departure" obligation only for whatever its
 * linked payments don't already cover. Cancelled payments are excluded
 * from obligation-building (but their paid amount still reduces
 * availableUsd). Obligations with no due date, or a due date after
 * departure, are pinned to departureDate.
 */
export function buildObligations(input: BuildObligationsInput): BuildObligationsResult {
  if (input.departureDate === null) {
    return { status: "no_departure_date" };
  }
  const departureDate = input.departureDate;

  const missingRates: MissingObligationRate[] = [];

  function toUsd(amount: number, currency: string, rateKind: RateKind, description: string): number | null {
    const converted = convertToUsd({ amount, currency, rateKind, rates: input.rates, asOfDate: input.asOfDate });
    if (converted === null) {
      missingRates.push({ description, currency, rateKind });
      return null;
    }
    return converted.amountUsd;
  }

  const savedUsd = input.savingsEntries
    .filter((entry) => entry.recordedOn <= input.asOfDate)
    .reduce((sum, entry) => sum + entry.amountUsd, 0);

  const paidUsd = input.allTripPayments.reduce((sum, payment) => {
    if (payment.paidAmount <= 0) return sum;
    const amount = toUsd(payment.paidAmount, payment.currency, "observed", `${payment.description} (paid)`);
    return sum + (amount ?? 0);
  }, 0);

  const availableUsd = savedUsd - paidUsd;

  const activePayments = input.payments.filter((payment) => payment.status !== "cancelled");
  const obligations: BuiltObligation[] = [];

  for (const payment of activePayments) {
    const remainder = payment.totalAmount - payment.paidAmount;
    if (remainder <= 0) continue;

    const targetUsd = toUsd(remainder, payment.currency, "planning_base", payment.description);
    const conservativeUsd = toUsd(remainder, payment.currency, "planning_conservative", payment.description);
    if (targetUsd === null || conservativeUsd === null) continue;

    const isEstimatedDueDate = payment.dueDate === null;
    let dueDate = payment.dueDate ?? departureDate;
    let clampedToDeparture = false;
    if (!isEstimatedDueDate && dueDate > departureDate) {
      dueDate = departureDate;
      clampedToDeparture = true;
    }

    obligations.push({
      description: payment.description,
      amountTargetUsd: targetUsd,
      amountConservativeUsd: conservativeUsd,
      dueDate,
      isEstimatedDueDate,
      clampedToDeparture,
    });
  }

  for (const line of input.budgetLines) {
    const linkedPayments = activePayments.filter((payment) => payment.budgetLineId === line.id);

    const linkedTargetUsd = linkedPayments.reduce((sum, payment) => {
      const amount = toUsd(payment.totalAmount, payment.currency, "planning_base", payment.description);
      return sum + (amount ?? 0);
    }, 0);
    const linkedConservativeUsd = linkedPayments.reduce((sum, payment) => {
      const amount = toUsd(payment.totalAmount, payment.currency, "planning_conservative", payment.description);
      return sum + (amount ?? 0);
    }, 0);

    const lineTargetUsd = toUsd(line.amountTarget, line.currency, "planning_base", line.description);
    const lineConservativeUsd = toUsd(line.amountConservative, line.currency, "planning_conservative", line.description);
    if (lineTargetUsd === null || lineConservativeUsd === null) continue;

    const remainderTargetUsd = Math.max(0, lineTargetUsd - linkedTargetUsd);
    const remainderConservativeUsd = Math.max(0, lineConservativeUsd - linkedConservativeUsd);
    if (remainderTargetUsd <= 0 && remainderConservativeUsd <= 0) continue;

    obligations.push({
      description: `${line.description} (unallocated)`,
      amountTargetUsd: remainderTargetUsd,
      amountConservativeUsd: remainderConservativeUsd,
      dueDate: departureDate,
      isEstimatedDueDate: true,
      clampedToDeparture: false,
    });
  }

  return {
    status: "ready",
    obligations,
    availableUsd,
    provisional: !input.departureDateConfirmed,
    missingRates,
  };
}
