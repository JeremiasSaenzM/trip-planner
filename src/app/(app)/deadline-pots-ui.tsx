import type { DeadlinePot } from "@/lib/domain/build-deadline-pots";
import type { ResolvedDeparture } from "@/lib/domain/resolve-departure-date";

import type { Basis } from "./dashboard-data";
import { formatDate, formatUsd } from "./format";
import { potItemText } from "./pot-item-text";

// "When money is needed": every deadline the savings plan saves toward,
// with the individual payments inside each one and what happened to each
// (potItemText()). The same obligations feed the headline figure and
// both savings charts, so nothing can be in one and missing here.
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
        {pots.map((pot) => (
          <li key={pot.dueDate} data-testid="deadline-pot">
            <div className="flex items-baseline justify-between gap-3">
              <p className={pot.isPastDue ? "font-medium text-red-700 dark:text-red-400" : "font-medium"}>
                {pot.isPastDue ? "Was due " : "By "}
                {formatDate(pot.dueDate)}
                {pot.dueDate === departure.date && (
                  <span className="font-normal text-zinc-500 dark:text-zinc-400"> · departure</span>
                )}
              </p>
              <p className="shrink-0 font-medium">{formatUsd(pot.amountUsd)}</p>
            </div>
            <ul className="mt-1 space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
              {pot.items.map((item, i) => (
                <li key={i} data-timing={item.timing}>
                  {potItemText(item)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
