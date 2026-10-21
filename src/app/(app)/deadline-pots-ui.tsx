import type { DeadlinePot } from "@/lib/domain/build-deadline-pots";
import type { ResolvedDeparture } from "@/lib/domain/resolve-departure-date";

import type { Basis } from "./dashboard-data";
import { formatDate, formatUsd } from "./format";
import { potIncomeNote, potItemText } from "./pot-item-text";

// "When money is needed": every deadline the savings plan saves toward,
// with the individual payments inside each one and what happened to each
// (potItemText()). The same obligations feed the headline figure and
// both savings charts, so nothing can be in one and missing here.
//
// A pot sits on an income date; when that's earlier than some of what's
// in it, potIncomeNote() says so. A pot whose date has already passed is
// red only when money already set aside doesn't cover it -- otherwise
// it's simply paid from savings, and said plainly.
export function DeadlinePotList({
  pots,
  departure,
  basis,
}: {
  pots: DeadlinePot[];
  departure: ResolvedDeparture;
  basis: Basis;
}) {
  if (pots.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing left to save for.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Totals are in USD at the {basis} basis. Each payment shows its amount at that basis, in the currency it was
        recorded in -- a planned estimate moves with its budget line; a committed, paid or confirmed one doesn&apos;t.
      </p>
      <ol data-testid="deadline-pots" className="space-y-4">
        {pots.map((pot) => {
          const shortfall = pot.isPastDue ? pot.shortfallNow : null;
          const short = shortfall !== null;
          const incomeNote = potIncomeNote(pot, departure.date);
          return (
            <li key={pot.dueDate} data-testid="deadline-pot">
              <div className="flex items-baseline justify-between gap-3">
                <p className={short ? "font-medium text-red-700 dark:text-red-400" : "font-medium"}>
                  {short ? "Was due " : "By "}
                  {formatDate(pot.dueDate)}
                  {pot.includesDeparture && (
                    <span className="font-normal text-zinc-500 dark:text-zinc-400"> · last income before you leave</span>
                  )}
                </p>
                <p className="shrink-0 font-medium">{formatUsd(pot.amountUsd)}</p>
              </div>
              {short && (
                <p className="text-xs text-red-700 dark:text-red-400">
                  Money set aside is {formatUsd(shortfall)} short of this.
                </p>
              )}
              {pot.isPastDue && !short && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  This date has passed, so it comes out of money already set aside -- which covers it.
                </p>
              )}
              {incomeNote && (
                <p data-testid="pot-income-note" className="text-xs text-zinc-500 dark:text-zinc-400">
                  {incomeNote}
                </p>
              )}
              <ul className="mt-1 space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                {pot.items.map((item, i) => (
                  <li key={i} data-timing={item.timing}>
                    {potItemText(item)}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
