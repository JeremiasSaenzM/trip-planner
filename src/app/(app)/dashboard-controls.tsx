import Link from "next/link";

import type { Scenario } from "@/lib/data/types";
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

const BASIS_LABELS: Record<Basis, string> = {
  minimum: "Minimum",
  target: "Target",
  conservative: "Conservative",
};

// Scenario and minimum/target/conservative toggles, shared by all three dashboard
// screens. Plain links (?scenario=&basis=) rather than client state, so a
// given view is a real URL and switching needs no client JS.
export function DashboardControls({
  basePath,
  scenarios,
  activeScenarioId,
  basis,
}: {
  basePath: string;
  scenarios: Scenario[];
  activeScenarioId: string;
  basis: Basis;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {scenarios.length > 1 &&
          scenarios.map((scenario) => (
            <Link
              key={scenario.id}
              href={`${basePath}?scenario=${scenario.id}&basis=${basis}`}
              aria-current={scenario.id === activeScenarioId ? "page" : undefined}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 aria-[current=page]:border-zinc-900 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white dark:border-zinc-700 dark:text-zinc-400 dark:aria-[current=page]:border-zinc-100 dark:aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:text-zinc-950"
            >
              {scenario.name}
            </Link>
          ))}
        {/* Always shown, even with a single scenario -- it's also the
            way to add a second one. */}
        <Link
          href={`/scenarios?scenario=${activeScenarioId}&basis=${basis}`}
          className="px-2 py-1 text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
        >
          Manage scenarios
        </Link>
      </div>

      <div className="flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
        {BASES.map((option) => (
          <Link
            key={option}
            href={`${basePath}?scenario=${activeScenarioId}&basis=${option}`}
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
