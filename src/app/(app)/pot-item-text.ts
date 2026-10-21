import type { DeadlinePot, DeadlinePotItem } from "@/lib/domain/build-deadline-pots";
import type { ResolvedDeparture } from "@/lib/domain/resolve-departure-date";

import { formatAmountCompact, formatDate } from "./format";

// One line per obligation in a savings pot, saying in words what
// buildObligations() did with it -- so a payment that was moved, or
// never had a date, is never silently shown under a date that isn't its
// own. Amounts are in the payment's own currency, not converted (the
// pot's total carries the converted figure), at the selected basis --
// see paymentAmountIsFixed() for which payments move with the basis.
export function potItemText(item: DeadlinePotItem): string {
  const amount = formatAmountCompact(item.originalAmount, item.originalCurrency);
  switch (item.timing) {
    case "on_date":
      return `${item.description} — ${amount}, due ${formatDate(item.originalDueDate!)}`;
    case "moved_to_departure":
      return `${item.description} — ${amount}, due ${formatDate(item.originalDueDate!)}, needed before you leave`;
    case "undated":
      return `${item.description} — ${amount}, no due date, assumed due at departure`;
    case "unallocated":
      return item.partlyCovered
        ? `${item.description} — ${amount}, not covered by its recorded payments, assumed due at departure`
        : `${item.description} — ${amount}, no payment recorded yet, assumed due at departure`;
  }
}

// Why a pot sits on an earlier date than some of what's in it: the
// income rule moved it back to the last income date before they're
// owed. Each item still names its own due date (potItemText()); this
// names the rule. null when nothing in the pot was moved by it.
export function potIncomeNote(pot: Pick<DeadlinePot, "owedLaterOn">, departureDate: string): string | null {
  if (pot.owedLaterOn.length === 0) return null;
  const dates = pot.owedLaterOn.map((date) => (date === departureDate ? `${formatDate(date)} (you leave)` : formatDate(date)));
  const list = dates.length === 1 ? dates[0] : `${dates.slice(0, -1).join(", ")} and ${dates.at(-1)}`;
  return `Your last income before ${list} -- what's owed then has to be saved by here.`;
}

// Which date the plan treats as "you leave", and why -- the anchor every
// pot above is measured against -- plus the last income before it, when
// that's earlier: the real deadline for everything owed at departure.
export function departureAnchorText(departure: ResolvedDeparture, departureSaveBy: string | null): string {
  const date = formatDate(departure.date);
  const anchor =
    departure.source === "trip"
      ? `Saving toward your departure on ${date}.`
      : `No departure date set for the trip yet, so saving toward the festival's first day, ${date}.`;
  return departureSaveBy && departureSaveBy !== departure.date
    ? `${anchor} Your last income before then arrives ${formatDate(departureSaveBy)}.`
    : anchor;
}
