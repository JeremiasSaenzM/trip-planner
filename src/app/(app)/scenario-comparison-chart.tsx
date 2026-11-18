"use client";

import { DateTime } from "luxon";
import { useId } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

function byDeadlineDetail(line: ScenarioComparisonLine): string {
  if (line.noLineReason === "no_departure_date") return "no bars: no departure date to save toward";
  if (line.pots.length === 0) return "no bars: nothing left to save";
  return `${line.pots.length} saving deadline${line.pots.length === 1 ? "" : "s"}`;
}

// Shared by both comparison charts, right under each: the swatch is the
// chart's own mark for that scenario, the text says what the scenario is.
function ComparisonLegend({
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

export type PotComparisonRow = {
  /** YYYY-MM-DD, a saving deadline at least one scenario has. */
  dueDate: string;
  /** Each scenario's pot on this deadline, by scenario id -- null when
   * that scenario has nothing due here. */
  amounts: Record<string, number | null>;
};

/**
 * One group per saving deadline any scenario has (the union, in date
 * order), one amount per scenario. A scenario with nothing due on a
 * deadline gets null, never 0: that absence is the comparison, and the
 * chart draws it as absence. Purely a re-layout of each scenario's own
 * pots -- never computes an amount.
 */
export function buildPotComparisonRows(lines: ScenarioComparisonLine[]): PotComparisonRow[] {
  const dates = [...new Set(lines.flatMap((line) => line.pots.map((pot) => pot.dueDate)))].sort();
  return dates.map((dueDate) => ({
    dueDate,
    amounts: Object.fromEntries(
      lines.map((line) => [line.scenarioId, line.pots.find((pot) => pot.dueDate === dueDate)?.amountUsd ?? null]),
    ),
  }));
}

// Bars: the viewed scenario solid in the accent colour; every other one
// a neutral outline with its own hatch, so a bar is told apart by fill
// and pattern, never by colour alone. Same per-scenario index as the
// line chart's dashes, so a scenario keeps its mark across both views.
const OTHER_HATCHES = [
  { rotate: 45, gap: 4 },
  { rotate: 135, gap: 4 },
  { rotate: 0, gap: 3 },
  { rotate: 90, gap: 3 },
];

function barFill(line: ScenarioComparisonLine, index: number, patternPrefix: string): string {
  return line.isViewed ? "var(--chart-target)" : `url(#${patternPrefix}-${index})`;
}

function HatchPatterns({ lines, prefix }: { lines: ScenarioComparisonLine[]; prefix: string }) {
  return (
    <defs>
      {lines.map((line, index) => {
        const hatch = OTHER_HATCHES[index % OTHER_HATCHES.length];
        return (
          <pattern
            key={line.scenarioId}
            id={`${prefix}-${index}`}
            width={hatch.gap}
            height={hatch.gap}
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${hatch.rotate})`}
          >
            <line x1="0" y1="0" x2="0" y2={hatch.gap} stroke="var(--chart-neutral)" strokeWidth="1.5" />
          </pattern>
        );
      })}
    </defs>
  );
}

type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: { absent: Record<string, boolean> };
};

// A bar, or -- where this scenario has nothing on the deadline -- a
// short dashed mark on the baseline in the bar's own slot, so the gap
// reads as "nothing due here", not as a bar that failed to load.
function potBarShape(scenarioId: string, isViewed: boolean) {
  function PotBar({ x = 0, y = 0, width = 0, height = 0, fill, payload }: BarShapeProps) {
    if (payload?.absent[scenarioId]) {
      return (
        <line
          x1={x + 1}
          x2={x + width - 1}
          y1={y}
          y2={y}
          stroke="var(--chart-neutral)"
          strokeWidth={1.5}
          strokeDasharray="2 2"
        />
      );
    }
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke={isViewed ? "none" : "var(--chart-neutral)"}
        strokeWidth={1}
      />
    );
  }
  return PotBar;
}

function formatDeadlineTick(date: string): string {
  return DateTime.fromISO(date, { zone: "utc" }).toFormat("MMM yyyy");
}

function PotTooltip({
  active,
  payload,
  lines,
}: {
  active?: boolean;
  payload?: { payload: PotComparisonRow }[];
  lines: ScenarioComparisonLine[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="max-w-64 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium">Set aside by {formatDate(row.dueDate)}</p>
      {lines.map((line) => (
        <p key={line.scenarioId} className={line.isViewed ? "font-medium" : "text-zinc-600 dark:text-zinc-400"}>
          {row.amounts[line.scenarioId] === null ? "nothing due" : formatUsd(row.amounts[line.scenarioId] as number)}{" "}
          · {line.name}
        </p>
      ))}
    </div>
  );
}

export function PotComparisonChart({ lines, basis }: { lines: ScenarioComparisonLine[]; basis: Basis }) {
  const patternPrefix = `pot-hatch-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const rows = buildPotComparisonRows(lines);
  // Recharts needs a number to lay a bar slot out, so an absent pot is
  // drawn at 0 -- with its absence kept alongside, for the shape, and
  // the tooltip reads row.amounts, never these zeros.
  const data = rows.map((row) => ({
    ...row,
    absent: Object.fromEntries(lines.map((line) => [line.scenarioId, row.amounts[line.scenarioId] === null])),
    ...Object.fromEntries(lines.map((line) => [line.scenarioId, row.amounts[line.scenarioId] ?? 0])),
  }));

  return (
    <div data-testid="pot-comparison">
      <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
        How much each scenario needs set aside by each saving deadline, at {BASIS_LABELS[basis]} -- when the money has
        to be saved, not when it&apos;s owed. A dashed mark means that scenario has nothing due then.
      </p>
      {/* Defined once, outside the chart, so the legend swatches can use them too. */}
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <HatchPatterns lines={lines} prefix={patternPrefix} />
      </svg>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No scenario has a deadline to save toward yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="dueDate" tickFormatter={formatDeadlineTick} tick={AXIS_TICK} stroke="var(--chart-grid)" />
            <YAxis tick={AXIS_TICK} stroke="var(--chart-grid)" width={52} tickFormatter={formatUsdTick} />
            <Tooltip content={<PotTooltip lines={lines} />} cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} />
            {lines.map((line, index) => (
              <Bar
                key={line.scenarioId}
                dataKey={line.scenarioId}
                name={line.name}
                fill={barFill(line, index, patternPrefix)}
                shape={potBarShape(line.scenarioId, line.isViewed)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
      <ComparisonLegend
        lines={lines}
        swatch={(line, index) => (
          <svg width="14" height="14" aria-hidden="true" className="mt-1 shrink-0">
            <rect
              x="0.5"
              y="0.5"
              width="13"
              height="13"
              fill={barFill(line, index, patternPrefix)}
              stroke={line.isViewed ? "none" : "var(--chart-neutral)"}
            />
          </svg>
        )}
        detail={byDeadlineDetail}
      />
    </div>
  );
}
