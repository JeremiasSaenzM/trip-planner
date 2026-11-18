import { cumulativeAt, type ScheduleEntry } from "./calculate-required-savings";
import type { Basis } from "./types";

export type CumulativeRequiredPoint = {
  /** YYYY-MM-DD: today for the first point, then each saving deadline. */
  date: string;
  /** Cumulative amount that must be saved by this date, at the basis asked for. */
  cumulativeUsd: number;
  /** Income dates left before this deadline -- 0 for today's starting point. */
  monthsUntil: number;
};

/**
 * "Money needed by this date" as a line: a starting point today at $0,
 * then one point per future saving deadline at the cumulative amount
 * owed by then (calculateRequiredSavings()'s schedule, so already after
 * the departure rule and the income rule). Past-due deadlines get no
 * point of their own -- they're already inside the first future
 * deadline's cumulative figure. Empty when nothing is due in future.
 *
 * The one place a schedule becomes a plotted line: the per-scenario
 * savings schedule chart and every line on the scenario comparison
 * chart both come from here, so the two can't draw the same scenario
 * differently.
 */
export function cumulativeRequiredSeries(
  schedule: ScheduleEntry[],
  basis: Basis,
  asOfDate: string,
): CumulativeRequiredPoint[] {
  const future = schedule.filter((entry) => !entry.isPastDue);
  if (future.length === 0) return [];
  return [
    { date: asOfDate, cumulativeUsd: 0, monthsUntil: 0 },
    ...future.map((entry) => ({
      date: entry.dueDate,
      cumulativeUsd: cumulativeAt(entry, basis),
      monthsUntil: entry.monthsUntil ?? 0,
    })),
  ];
}
