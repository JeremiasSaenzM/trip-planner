"use client";

import { DateTime } from "luxon";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { Basis } from "@/lib/domain/types";

import { BASIS_LABELS } from "./dashboard-controls";
import { formatDate, formatDateRange, formatUsd } from "./format";
import type { ScenarioComparisonLine } from "./scenario-savings";

// A YYYY-MM-DD value is a calendar date, not an instant -- see charts.tsx.
function toTimestamp(date: string): number {
  return DateTime.fromISO(date, { zone: "utc" }).toMillis();
}

function formatDateTick(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: "utc" }).toFormat("MMM d");
}

function formatUsdTick(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

const AXIS_TICK = { fontSize: 11, fill: "var(--chart-neutral)" };

// The viewed scenario: the accent colour, heavier, solid. Every other
// one: the neutral colour, lighter, each with its own dash -- so a line
// is told apart by weight and pattern, never by colour alone. The dash
// follows the scenario (its place in the trip's scenario order), not
// which one is being viewed, so switching scenario doesn't repaint the
// rest.
const VIEWED_STYLE = { stroke: "var(--chart-target)", strokeWidth: 3, strokeDasharray: undefined };
const OTHER_DASHES = ["6 4", "2 3", "10 3 2 3", "1 4"];

function lineStyle(line: ScenarioComparisonLine, index: number) {
  if (line.isViewed) return VIEWED_STYLE;
  return { stroke: "var(--chart-neutral)", strokeWidth: 1.5, strokeDasharray: OTHER_DASHES[index % OTHER_DASHES.length] };
}

export type ComparisonChartRow = { timestamp: number } & Record<string, number | null>;

/**
 * Every line's points on one shared set of dates, so one tooltip can
 * read all of them at a date. Purely a re-layout: between two of a
 * line's own points it holds the earlier point's value -- exactly what
 * a step line draws there anyway -- and it's null outside the line's
 * own first and last date, so no line is drawn past where its plan ends.
 * Never computes an amount of its own.
 */
export function buildComparisonChartRows(lines: ScenarioComparisonLine[]): ComparisonChartRow[] {
  const dates = [...new Set(lines.flatMap((line) => line.points.map((point) => point.date)))].sort();
  return dates.map((date) => {
    const row: ComparisonChartRow = { timestamp: toTimestamp(date) } as ComparisonChartRow;
    for (const line of lines) {
      const first = line.points[0];
      const last = line.points.at(-1);
      if (!first || !last || date < first.date || date > last.date) {
        row[line.scenarioId] = null;
        continue;
      }
      row[line.scenarioId] = line.points.filter((point) => point.date <= date).at(-1)!.cumulativeUsd;
    }
    return row;
  });
}

function ComparisonTooltip({
  active,
  payload,
  label,
  lines,
}: {
  active?: boolean;
  payload?: { payload: ComparisonChartRow }[];
  label?: number;
  lines: ScenarioComparisonLine[];
}) {
  if (!active || !payload?.length || label === undefined) return null;
  const row = payload[0].payload;
  return (
    <div className="max-w-64 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium">Saved by {formatDateTick(label)}</p>
      {lines.map((line) =>
        row[line.scenarioId] === null || row[line.scenarioId] === undefined ? null : (
          <p key={line.scenarioId} className={line.isViewed ? "font-medium" : "text-zinc-600 dark:text-zinc-400"}>
            {formatUsd(row[line.scenarioId] as number)} · {line.name}
          </p>
        ),
      )}
    </div>
  );
}

function LegendSwatch({ style }: { style: ReturnType<typeof lineStyle> }) {
  return (
    <svg width="28" height="10" aria-hidden="true" className="mt-1.5 shrink-0">
      <line x1="1" y1="5" x2="27" y2="5" {...style} />
    </svg>
  );
}

/** What the scenario is, for the legend: its nights in beds and its
 * resolved travel window -- two lines in the same place can still be
 * two very different trips. */
function windowText(line: ScenarioComparisonLine): string {
  if (line.departureDate === null || line.returnDate === null) return "travel dates not set";
  const nights =
    line.nightsInBeds !== null ? `${line.nightsInBeds} night${line.nightsInBeds === 1 ? "" : "s"}, ` : "";
  return `${nights}${formatDateRange(line.departureDate, line.returnDate)}`;
}

function runningTotalDetail(line: ScenarioComparisonLine): string {
  const last = line.points.at(-1);
  if (line.noLineReason === "no_departure_date") return "no line: no departure date to save toward";
  if (line.noLineReason === "nothing_due" || !last) return "no line: nothing left to save";
  return `${formatUsd(last.cumulativeUsd)} by ${formatDate(last.date)}`;
}

// Right under each comparison chart: the swatch is the chart's own mark
// for that scenario, the text says what the scenario is.
export function ComparisonLegend({
  lines,
  swatch,
  detail,
}: {
  lines: ScenarioComparisonLine[];
  swatch: (line: ScenarioComparisonLine, index: number) => React.ReactNode;
  detail: (line: ScenarioComparisonLine) => string;
}) {
  return (
    <ul className="mt-2 space-y-1.5 text-sm" aria-label="Scenarios on this chart">
      {lines.map((line, index) => (
        <li key={line.scenarioId} className="flex gap-2" data-testid="scenario-comparison-legend-item">
          {swatch(line, index)}
          <div>
            <p className={line.isViewed ? "font-medium" : "text-zinc-700 dark:text-zinc-300"}>
              {line.name}
              {line.isViewed && <span className="font-normal text-zinc-500 dark:text-zinc-400"> (this scenario)</span>}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {windowText(line)} · {detail(line)}
            </p>
            {line.missingRateCount > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {line.missingRateCount} amount{line.missingRateCount === 1 ? "" : "s"} missing an FX rate, left out
                -- this scenario&apos;s figures sit too low.
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ScenarioComparisonChart({ lines, basis }: { lines: ScenarioComparisonLine[]; basis: Basis }) {
  const rows = buildComparisonChartRows(lines);

  return (
    <div data-testid="scenario-comparison">
      <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
        How much each scenario needs saved by each date, at {BASIS_LABELS[basis]} -- when the money has to be set
        aside, not when it&apos;s owed. Each line ends at everything that scenario still needs saved.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No scenario has a deadline to save toward yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatDateTick}
              tick={AXIS_TICK}
              stroke="var(--chart-grid)"
            />
            <YAxis tick={AXIS_TICK} stroke="var(--chart-grid)" width={52} tickFormatter={formatUsdTick} />
            <Tooltip content={<ComparisonTooltip lines={lines} />} />
            {/* Others first, so the viewed line is drawn on top of them. */}
            {[...lines.map((line, index) => ({ line, index }))]
              .sort((a, b) => Number(a.line.isViewed) - Number(b.line.isViewed))
              .map(({ line, index }) => (
                <Line
                  key={line.scenarioId}
                  type="stepAfter"
                  dataKey={line.scenarioId}
                  name={line.name}
                  {...lineStyle(line, index)}
                  dot={line.isViewed ? { r: 3, fill: "var(--chart-target)" } : false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <ComparisonLegend
        lines={lines}
        swatch={(line, index) => <LegendSwatch style={lineStyle(line, index)} />}
        detail={runningTotalDetail}
      />
    </div>
  );
}
