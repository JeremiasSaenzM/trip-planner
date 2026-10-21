import type { DeadlinePotItem } from "@/lib/domain/build-deadline-pots";
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
      return `${item.description} — ${amount}, no payment recorded yet, assumed due at departure`;
  }
}

// Which date the plan treats as "you leave", and why -- the anchor every
// pot above is measured against.
export function departureAnchorText(departure: ResolvedDeparture): string {
  const date = formatDate(departure.date);
  return departure.source === "trip"
    ? `Saving toward your departure on ${date}.`
    : `No departure date set for the trip yet, so saving toward the festival's first day, ${date}.`;
}
