import type { DepartureSource } from "./resolve-departure-date";
import type { InfoState } from "./types";

export type UnconfirmedDateFact = {
  /** Names the specific thing that's unconfirmed -- never a generic
   * "some dates are provisional" (phase-6.8-provisional-dates.md's own
   * bad example of what this must not say). */
  statement: string;
  /** checkEventPresence (hard constraint 2) reads the event's own
   * dates only, never the resolved travel window -- so this is set
   * independently of the other two below. */
  touchesFlightOptions: boolean;
  /** The payment due dates and the savings deadline both move with the
   * same resolved departure date, so these two are always equal. */
  touchesPayments: boolean;
  touchesSavingsDeadline: boolean;
};

export type BuildUnconfirmedDateFactsInput = {
  /** null when the scenario has no event. An event whose dates aren't
   * published at all (startDate null) contributes nothing either --
   * checkEventPresence already treats that as not_applicable, not
   * provisional (there's no date yet to be unconfirmed about), and
   * this follows the same line so the two never disagree. */
  event: { name: string; startDate: string | null; datesState: InfoState } | null;
  /** The already-resolved departure (resolveDepartureDate()) -- null
   * when there's no departure date to plan against yet, in which case
   * there's nothing for a window-side fact to touch either. */
  departure: { source: DepartureSource; confirmed: boolean } | null;
};

/**
 * What a scenario's displayed figures rest on: which dates are still
 * unconfirmed, and which of the flight option, the payment due dates
 * and the savings deadline each one touches. Derived fresh from data
 * the app already stores -- the honest replacement for the acceptance
 * safeguard removed on 2026-11-02, since it's true for exactly as long
 * as a field says `pending`, not for as long as nobody's dismissed a
 * one-time warning (phase-6.8-provisional-dates.md).
 *
 * Never a fourth hard constraint: nothing here is a ConstraintStatus,
 * nothing feeds worstStatus, and a scenario page renders this
 * separately from, not inside, its hard-constraints block.
 *
 * At most two facts, not one of each kind: when the resolved departure
 * date actually came from the event's own start date
 * (departure.source === "event", resolveDepartureDate()'s own
 * fallback), the event's unconfirmed dates and "the departure date
 * isn't confirmed" are the same underlying field, so they merge into
 * one statement touching all three figures -- never two statements
 * about the same date.
 */
export function buildUnconfirmedDateFacts(input: BuildUnconfirmedDateFactsInput): UnconfirmedDateFact[] {
  const eventUnconfirmed =
    input.event !== null && input.event.startDate !== null && input.event.datesState !== "confirmed";
  const windowUnconfirmed = input.departure !== null && !input.departure.confirmed;

  if (eventUnconfirmed && windowUnconfirmed && input.departure!.source === "event") {
    return [
      {
        statement: `The dates for ${input.event!.name} are not published.`,
        touchesFlightOptions: true,
        touchesPayments: true,
        touchesSavingsDeadline: true,
      },
    ];
  }

  const facts: UnconfirmedDateFact[] = [];
  if (eventUnconfirmed) {
    facts.push({
      statement: `The dates for ${input.event!.name} are not published.`,
      touchesFlightOptions: true,
      touchesPayments: false,
      touchesSavingsDeadline: false,
    });
  }
  if (windowUnconfirmed) {
    facts.push({
      statement:
        input.departure!.source === "scenario"
          ? "This scenario's own travel window isn't confirmed yet."
          : "The trip's travel window isn't confirmed yet.",
      touchesFlightOptions: false,
      touchesPayments: true,
      touchesSavingsDeadline: true,
    });
  }
  return facts;
}
