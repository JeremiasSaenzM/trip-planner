import { convertToUsd, type FxRate } from "./convert-to-usd";
import type { SavingsEntry } from "./calculate-required-savings";
import type { Basis, InfoState, RateKind } from "./types";

export type PaymentForObligations = {
  id: string;
  budgetLineId: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  currency: string;
  /** YYYY-MM-DD, or null -- a payment with no due date yet. */
  dueDate: string | null;
  status: "planned" | "committed" | "paid" | "cancelled";
  /** The payment's own information_state (its amount), not its dates'. */
  informationState: InfoState;
};

/**
 * Whether a payment's amount is a fixed figure -- the same at every
 * basis -- or a placeholder that moves with its budget line.
 *
 * Fixed when, and only when, one of these holds:
 *   - status is "committed" or "paid": the money is promised or gone, so
 *     there's no range left to it;
 *   - information_state is "confirmed": the amount itself is a sourced
 *     fact (a confirmed room rate, a quoted fare), even before booking.
 * Everything else -- in practice "planned" with an estimate, assumption,
 * pending, decision, historical or conflicting amount -- is a
 * placeholder, usually copying its line's target. It scales with the
 * line: minimum and conservative by the line's own min/target and
 * conservative/target ratios. Recording a real booking (status
 * committed/paid) or confirming the amount is what stops it scaling.
 * ("cancelled" never reaches here: cancelled payments build no obligation.)
 */
export function paymentAmountIsFixed(payment: Pick<PaymentForObligations, "status" | "informationState">): boolean {
  return payment.status === "committed" || payment.status === "paid" || payment.informationState === "confirmed";
}

export type BudgetLineForObligations = {
  id: string;
  description: string;
  amountMin: number;
  amountTarget: number;
  amountConservative: number;
  currency: string;
};

// Structurally a superset of calculate-required-savings's Obligation, so
// the caller can pass result.obligations straight into
// calculateRequiredSavings() without mapping -- same pattern as
// BudgetLineForRollup/FxRate elsewhere in this directory.
export type BuiltObligation = {
  /** What this obligation was built from -- one payment's unpaid
   * remainder, or the part of a budget line no payment covers yet. Lets
   * a caller check every payment ended up in exactly one deadline. */
  origin: { kind: "payment"; paymentId: string } | { kind: "unallocated"; budgetLineId: string };
  description: string;
  amountMinimumUsd: number;
  amountTargetUsd: number;
  amountConservativeUsd: number;
  /** The same amount, per basis, in the currency it was recorded in,
   * before any conversion -- what the traveller will recognise ("£330",
   * not "$419"). Equal across bases for a fixed payment
   * (paymentAmountIsFixed()); scaled with its line for a placeholder. */
  originalAmounts: Record<Basis, number>;
  originalCurrency: string;
  /** YYYY-MM-DD, the payment's own due date as recorded -- null for an
   * undated payment or an unallocated remainder. dueDate below is where
   * the plan actually puts it. */
  originalDueDate: string | null;
  /** YYYY-MM-DD. Never after departureDate -- see clampedToDeparture. */
  dueDate: string;
  /** True when there was no due date to use and this was set to
   * departureDate (an undated payment, or an unallocated remainder). */
  isEstimatedDueDate: boolean;
  /** True when an explicit due date after departure was pulled back to it:
   * money needed during the trip must be saved before leaving. */
  clampedToDeparture: boolean;
};

export type ObligationTiming = "on_date" | "moved_to_departure" | "undated" | "unallocated";

/**
 * How an obligation's place in the plan relates to its own due date, so
 * the UI can say it in words instead of silently showing the moved date:
 *   on_date            -- due on its own date, before departure
 *   moved_to_departure -- due after departure; saved for by departure
 *   undated            -- a payment with no due date; assumed due at departure
 *   unallocated        -- part of a budget line no payment covers yet;
 *                         also assumed due at departure
 */
export function obligationTiming(
  obligation: Pick<BuiltObligation, "origin" | "clampedToDeparture" | "isEstimatedDueDate">,
): ObligationTiming {
  if (obligation.origin.kind === "unallocated") return "unallocated";
  if (obligation.clampedToDeparture) return "moved_to_departure";
  if (obligation.isEstimatedDueDate) return "undated";
  return "on_date";
}

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
  /** YYYY-MM-DD, the day the traveller leaves -- resolved by the caller
   * with resolveDepartureDate() (the trip's own departure date, else the
   * competition's first official day). null if neither exists. */
  departureDate: string | null;
  /** competition.dates_state === 'confirmed', resolved by the caller. */
  departureDateConfirmed: boolean;
  /** YYYY-MM-DD, "today" -- used only to convert already-paid amounts
   * (observed rate) and to filter which savings entries count so far.
   * Never used as a due date. */
  asOfDate: string;
};

export type BuildObligationsResult =
  | {
      status: "no_departure_date";
      /** Still computed with no departure date: money set aside minus
       * what's already been paid is a fact about the past, independent
       * of when the trip starts. Only the obligations need a date. */
      availableUsd: number;
      /** Only already-paid amounts that couldn't be converted -- no
       * obligation is built, so none of those can be missing a rate. */
      missingRates: MissingObligationRate[];
    }
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
 * availableUsd).
 *
 * The departure rule: every obligation is due on or before departureDate.
 * One due after it (a hotel paid at the property mid-trip, a rail pass
 * bought on arrival) is moved back to departureDate, because money spent
 * during the trip can't be saved from income earned during the trip --
 * it has to be set aside before leaving. An undated payment, and a budget
 * line's unallocated remainder, are assumed due at departure for the same
 * reason: it's the latest date the money could still be saved by. Each
 * keeps its original amount, currency and due date, so the plan can show
 * what was moved and why (see obligationTiming()).
 *
 * Bases: minimum converts at planning_base, like target (same as
 * rollUpBudgetByScenario); conservative at planning_conservative. A
 * fixed payment (paymentAmountIsFixed()) is the same amount at every
 * basis. A placeholder payment takes its line's minimum/target/
 * conservative shape, so a line fully covered by a planned estimate
 * payment still shows its own range -- and that range is due on the
 * payment's date, not at departure, because that's when the money is
 * needed. Each line's unallocated remainder is netted per basis against
 * its payments' amounts at that same basis.
 */
export function buildObligations(input: BuildObligationsInput): BuildObligationsResult {
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

  if (input.departureDate === null) {
    return { status: "no_departure_date", availableUsd, missingRates };
  }
  const departureDate = input.departureDate;

  const activePayments = input.payments.filter((payment) => payment.status !== "cancelled");
  const obligations: BuiltObligation[] = [];
  const linesById = new Map(input.budgetLines.map((line) => [line.id, line]));

  // An amount of this payment, per basis, in its own currency. A
  // placeholder scales by its line's ratios; a fixed payment -- or one
  // whose line isn't in this scenario's set, or has a zero target to
  // take a ratio of -- stays as recorded.
  function amountsByBasis(payment: PaymentForObligations, amount: number): Record<Basis, number> {
    const line = linesById.get(payment.budgetLineId);
    if (paymentAmountIsFixed(payment) || !line || line.amountTarget <= 0) {
      return { minimum: amount, target: amount, conservative: amount };
    }
    return {
      minimum: amount * (line.amountMin / line.amountTarget),
      target: amount,
      conservative: amount * (line.amountConservative / line.amountTarget),
    };
  }

  function toUsdByBasis(amounts: Record<Basis, number>, currency: string, description: string) {
    const minimum = toUsd(amounts.minimum, currency, "planning_base", description);
    const target = toUsd(amounts.target, currency, "planning_base", description);
    const conservative = toUsd(amounts.conservative, currency, "planning_conservative", description);
    if (minimum === null || target === null || conservative === null) return null;
    return { minimum, target, conservative };
  }

  for (const payment of activePayments) {
    const remainder = payment.totalAmount - payment.paidAmount;
    if (remainder <= 0) continue;

    const originalAmounts = amountsByBasis(payment, remainder);
    const usd = toUsdByBasis(originalAmounts, payment.currency, payment.description);
    if (usd === null) continue;

    const isEstimatedDueDate = payment.dueDate === null;
    let dueDate = payment.dueDate ?? departureDate;
    let clampedToDeparture = false;
    if (!isEstimatedDueDate && dueDate > departureDate) {
      dueDate = departureDate;
      clampedToDeparture = true;
    }

    obligations.push({
      origin: { kind: "payment", paymentId: payment.id },
      description: payment.description,
      originalAmounts,
      originalCurrency: payment.currency,
      originalDueDate: payment.dueDate,
      amountMinimumUsd: usd.minimum,
      amountTargetUsd: usd.target,
      amountConservativeUsd: usd.conservative,
      dueDate,
      isEstimatedDueDate,
      clampedToDeparture,
    });
  }

  for (const line of input.budgetLines) {
    const linkedPayments = activePayments.filter((payment) => payment.budgetLineId === line.id);

    // What the line's payments already cover, at each basis -- their
    // full totals (paid part included), scaled the same way as their
    // obligations above, so the line isn't counted twice at any basis.
    const linked = { minimum: 0, target: 0, conservative: 0 };
    for (const payment of linkedPayments) {
      const usd = toUsdByBasis(amountsByBasis(payment, payment.totalAmount), payment.currency, payment.description);
      if (usd === null) continue;
      linked.minimum += usd.minimum;
      linked.target += usd.target;
      linked.conservative += usd.conservative;
    }

    const lineTargetUsd = toUsd(line.amountTarget, line.currency, "planning_base", line.description);
    const lineConservativeUsd = toUsd(line.amountConservative, line.currency, "planning_conservative", line.description);
    if (lineTargetUsd === null || lineConservativeUsd === null) continue;
    // Same currency and rate kind as lineTargetUsd, which just converted,
    // so this can't be the one that's missing a rate.
    const lineMinimumUsd = toUsd(line.amountMin, line.currency, "planning_base", line.description) ?? 0;

    const remainderMinimumUsd = Math.max(0, lineMinimumUsd - linked.minimum);
    const remainderTargetUsd = Math.max(0, lineTargetUsd - linked.target);
    const remainderConservativeUsd = Math.max(0, lineConservativeUsd - linked.conservative);
    if (remainderMinimumUsd <= 0 && remainderTargetUsd <= 0 && remainderConservativeUsd <= 0) continue;

    obligations.push({
      origin: { kind: "unallocated", budgetLineId: line.id },
      description: `${line.description} (unallocated)`,
      // The remainder is netted in USD (its payments may be in another
      // currency than the line), so there's no original-currency figure
      // for it -- its USD remainders stand in, per basis.
      originalAmounts: {
        minimum: remainderMinimumUsd,
        target: remainderTargetUsd,
        conservative: remainderConservativeUsd,
      },
      originalCurrency: "USD",
      originalDueDate: null,
      amountMinimumUsd: remainderMinimumUsd,
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
