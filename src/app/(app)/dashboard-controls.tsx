import Link from "next/link";

import type { Scenario } from "@/lib/data/types";
import type { Basis } from "./dashboard-data";

// Scenario and target/conservative toggles, shared by all three dashboard
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
      {scenarios.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {scenarios.map((scenario) => (
            <Link
              key={scenario.id}
              href={`${basePath}?scenario=${scenario.id}&basis=${basis}`}
              aria-current={scenario.id === activeScenarioId ? "page" : undefined}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 aria-[current=page]:border-zinc-900 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white dark:border-zinc-700 dark:text-zinc-400 dark:aria-[current=page]:border-zinc-100 dark:aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:text-zinc-950"
            >
              {scenario.name}
            </Link>
          ))}
        </div>
      ) : (
        <span />
      )}

      <div className="flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
        {(["target", "conservative"] as const).map((option) => (
          <Link
            key={option}
            href={`${basePath}?scenario=${activeScenarioId}&basis=${option}`}
            aria-current={option === basis ? "page" : undefined}
            className="rounded-full px-3 py-1 text-xs font-medium capitalize text-zinc-600 aria-[current=page]:bg-white aria-[current=page]:text-zinc-950 aria-[current=page]:shadow dark:text-zinc-400 dark:aria-[current=page]:bg-zinc-950 dark:aria-[current=page]:text-zinc-50"
          >
            {option}
          </Link>
        ))}
      </div>
    </div>
  );
}
