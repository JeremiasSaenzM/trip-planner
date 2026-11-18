import Link from "next/link";

import type { Basis } from "@/lib/domain/types";

import { dashboardHref } from "./dashboard-query";
import { SAVINGS_VIEW_LABELS, SAVINGS_VIEWS, type SavingsView } from "./savings-view";

// Switches which pair of savings charts the page shows. Plain links,
// like the basis toggle: the choice is ?savings= in the URL, carried
// between pages by dashboard-query.ts. Renders one option per entry in
// SAVINGS_VIEWS, so a third saving method appears here by being added
// there.
export function SavingsViewToggle({
  basePath,
  trip,
  scenario,
  basis,
  savingsView,
}: {
  basePath: string;
  trip: string;
  scenario: string;
  basis: Basis;
  savingsView: SavingsView;
}) {
  return (
    <nav aria-label="How to show savings" className="flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
      {SAVINGS_VIEWS.map((option) => (
        <Link
          key={option}
          href={dashboardHref(basePath, { trip, scenario, basis, savings: option })}
          aria-current={option === savingsView ? "page" : undefined}
          scroll={false}
          className="rounded-full px-3 py-1 text-xs font-medium text-zinc-600 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white dark:text-zinc-400 dark:aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:text-zinc-950"
        >
          {SAVINGS_VIEW_LABELS[option]}
        </Link>
      ))}
    </nav>
  );
}
