import Link from "next/link";

import type { Scenario, Trip } from "@/lib/data/types";
import { BASES, type Basis } from "@/lib/domain/types";

// Each option's active state uses the chart accent color it shares with
// the charts (var(--chart-minimum) / var(--chart-target) /
// var(--chart-conservative)) -- text color is chosen per option per mode
// since target's bg is dark-in-light mode/bright-in-dark-mode while
// conservative is the opposite. Minimum is a neutral grey either way:
// it isn't one of the two planning figures.
const BASIS_ACTIVE_CLASSES: Record<Basis, string> = {
  minimum: "aria-[current=page]:bg-chart-minimum aria-[current=page]:text-white dark:aria-[current=page]:text-zinc-950",
  target: "aria-[current=page]:bg-chart-target aria-[current=page]:text-white dark:aria-[current=page]:text-zinc-950",
  conservative:
    "aria-[current=page]:bg-chart-conservative aria-[current=page]:text-zinc-950 dark:aria-[current=page]:text-white",
};

export const BASIS_LABELS: Record<Basis, string> = {
  minimum: "Minimum",
  target: "Target",
  conservative: "Conservative",
};

// Trip, scenario and minimum/target/conservative toggles, shared by all
// five dashboard screens. Plain links (?trip=&scenario=&basis=) rather
// than client state, so a given view is a real URL and switching needs
// no client JS -- and every one of these keys has to stay listed in
// dashboard-query.ts's CARRIED_KEYS, or it stops surviving a nav click.
export function DashboardControls({
  basePath,
  trips,
  activeTripId,
  scenarios,
  activeScenarioId,
  basis,
}: {
  basePath: string;
  trips: Trip[];
  activeTripId: string;
  scenarios: Scenario[];
  activeScenarioId: string;
  basis: Basis;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <TripSwitcher basePath={basePath} trips={trips} activeTripId={activeTripId} basis={basis} />
        {scenarios.length > 1 &&
          scenarios.map((scenario) => (
            <Link
              key={scenario.id}
              href={`${basePath}?trip=${activeTripId}&scenario=${scenario.id}&basis=${basis}`}
              aria-current={scenario.id === activeScenarioId ? "page" : undefined}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 aria-[current=page]:border-zinc-900 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white dark:border-zinc-700 dark:text-zinc-400 dark:aria-[current=page]:border-zinc-100 dark:aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:text-zinc-950"
            >
              {scenario.name}
            </Link>
          ))}
        <Link
          href={`/scenario?trip=${activeTripId}&scenario=${activeScenarioId}&basis=${basis}`}
          className="px-2 py-1 text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
        >
          About this scenario
        </Link>
        {/* Always shown, even with a single scenario -- it's also the
            way to add a second one. */}
        <Link
          href={`/scenarios?trip=${activeTripId}&scenario=${activeScenarioId}&basis=${basis}`}
          className="px-2 py-1 text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
        >
          Manage scenarios
        </Link>
      </div>

      <div className="flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
        {BASES.map((option) => (
          <Link
            key={option}
            href={`${basePath}?trip=${activeTripId}&scenario=${activeScenarioId}&basis=${option}`}
            aria-current={option === basis ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 ${BASIS_ACTIVE_CLASSES[option]}`}
          >
            {BASIS_LABELS[option]}
          </Link>
        ))}
      </div>
    </div>
  );
}

// The trip-switching half of DashboardControls, split out so it can
// also render on the no_scenario/no_trip empty states (a trip with
// nothing in it yet still needs a way back to a trip that has
// something) -- those pages have no scenario/basis to carry, so they
// use this directly instead of the full control bar.
//
// Switching trips deliberately drops ?scenario= rather than carrying
// the old one forward: a different trip's scenario ids mean nothing to
// it, and loadDashboardData()'s own fallback (tripScenarios.find(...)
// ?? tripScenarios[0]) already treats a missing/stale id as "use this
// trip's own first scenario" -- exactly what should happen here.
export function TripSwitcher({
  basePath,
  trips,
  activeTripId,
  basis,
}: {
  basePath: string;
  trips: Trip[];
  activeTripId: string;
  basis?: Basis;
}) {
  const basisQuery = basis ? `&basis=${basis}` : "";
  return (
    <>
      {trips.length > 1 &&
        trips.map((trip) => (
          <Link
            key={trip.id}
            href={`${basePath}?trip=${trip.id}${basisQuery}`}
            aria-current={trip.id === activeTripId ? "page" : undefined}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 aria-[current=page]:border-zinc-900 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white dark:border-zinc-700 dark:text-zinc-400 dark:aria-[current=page]:border-zinc-100 dark:aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:text-zinc-950"
          >
            {trip.name}
          </Link>
        ))}
      {/* Always shown, even with a single trip -- it's also the way to
          add a second one. */}
      <Link
        href={`/trips?trip=${activeTripId}`}
        className="px-2 py-1 text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
      >
        Manage trips
      </Link>
    </>
  );
}
