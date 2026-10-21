import type { Metadata } from "next";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import type { BudgetLine, Payment, Source } from "@/lib/data/types";

import { DashboardControls } from "../dashboard-controls";
import { loadDashboardData } from "../dashboard-data";
import { Card, EmptyState, noDepartureReason } from "../dashboard-ui";
import { formatAmount, formatDate } from "../format";
import { AddPaymentForm, PaymentRowActions } from "../payment-write-ui";
import { REFUNDABILITY_LABELS, STATUS_LABELS, TIMING_LABELS } from "../payment-labels";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}>
        <PaymentsScreen searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PaymentsScreen({ searchParams }: { searchParams: PageProps<"/payments">["searchParams"] }) {
  await getCurrentUser();
  const { scenario: scenarioId, basis } = await searchParams;
  const data = await loadDashboardData({
    scenarioId: typeof scenarioId === "string" ? scenarioId : undefined,
    basis: typeof basis === "string" ? basis : undefined,
  });

  if (data.status === "no_trip") return <EmptyState>No trip yet.</EmptyState>;
  if (data.status === "no_scenario") return <EmptyState>No scenario yet for this trip.</EmptyState>;

  const { payments, competition, departure, asOfDate, trip, scenario, budgetLines, tripPayments, sources } = data;
  const competitionId = competition?.id ?? null;

  const addForm = <AddPaymentForm tripId={trip.id} scenarioId={scenario.id} budgetLines={budgetLines} />;

  if (payments.length === 0) {
    return (
      <div className="space-y-6">
        <DashboardControls
          basePath="/payments"
          scenarios={data.scenarios}
          activeScenarioId={data.scenario.id}
          basis={data.basis}
        />
        <Card>{addForm}</Card>
        <EmptyState>No payments recorded for this scenario yet.</EmptyState>
      </div>
    );
  }

  // The split is by the departure date the savings plan uses (the trip's
  // own, else the festival's first day -- resolveDepartureDate()). With
  // neither there's no line to split on -- so say that, and list
  // everything under a neutral heading rather than silently calling it
  // all "before you leave".
  const departureDate = departure?.date ?? null;
  const preTrip =
    departureDate === null ? [] : payments.filter((p) => p.dueDate === null || p.dueDate < departureDate);
  const duringTrip =
    departureDate === null ? [] : payments.filter((p) => p.dueDate !== null && p.dueDate >= departureDate);

  const groupProps = { asOfDate, tripId: trip.id, competitionId, budgetLines, tripPayments, sources };

  return (
    <div className="space-y-6">
      <DashboardControls
        basePath="/payments"
        scenarios={data.scenarios}
        activeScenarioId={data.scenario.id}
        basis={data.basis}
      />

      <Card>{addForm}</Card>

      {departureDate === null ? (
        <>
          <p data-testid="no-payment-split" className="text-sm text-zinc-600 dark:text-zinc-400">
            {noDepartureReason(competition)}, so payments can&apos;t be split into &ldquo;before you leave&rdquo; and
            &ldquo;during the trip&rdquo;.
          </p>
          <PaymentGroup title="All payments" payments={payments} {...groupProps} />
        </>
      ) : (
        <>
          <PaymentGroup title="Due before you leave" payments={preTrip} {...groupProps} />
          <PaymentGroup title="Due during the trip" payments={duringTrip} {...groupProps} />
        </>
      )}
    </div>
  );
}

function PaymentGroup({
  title,
  payments,
  asOfDate,
  tripId,
  competitionId,
  budgetLines,
  tripPayments,
  sources,
}: {
  title: string;
  payments: Payment[];
  asOfDate: string;
  tripId: string;
  competitionId: string | null;
  budgetLines: BudgetLine[];
  tripPayments: Payment[];
  sources: Source[];
}) {
  if (payments.length === 0) return null;

  const sorted = [...payments].sort((a, b) => (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99"));

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h2>
      <div className="space-y-2">
        {sorted.map((payment) => (
          <PaymentRow
            key={payment.id}
            payment={payment}
            asOfDate={asOfDate}
            tripId={tripId}
            competitionId={competitionId}
            budgetLines={budgetLines}
            tripPayments={tripPayments}
            sources={sources}
          />
        ))}
      </div>
    </div>
  );
}

function PaymentRow({
  payment,
  asOfDate,
  tripId,
  competitionId,
  budgetLines,
  tripPayments,
  sources,
}: {
  payment: Payment;
  asOfDate: string;
  tripId: string;
  competitionId: string | null;
  budgetLines: BudgetLine[];
  tripPayments: Payment[];
  sources: Source[];
}) {
  const dueLater = payment.totalAmount - payment.paidAmount;
  const cancellationSoon =
    payment.cancellationDeadline !== null &&
    payment.cancellationDeadline >= asOfDate &&
    payment.cancellationDeadline <= addDays(asOfDate, 30);

  const budgetLine = budgetLines.find((line) => line.id === payment.budgetLineId);
  const otherPaymentsOnBudgetLine = tripPayments.filter(
    (other) => other.budgetLineId === payment.budgetLineId && other.id !== payment.id,
  ).length;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{payment.description}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {STATUS_LABELS[payment.status]} · {TIMING_LABELS[payment.timingType]} ·{" "}
            {REFUNDABILITY_LABELS[payment.refundability]}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-medium">{formatAmount(payment.totalAmount, payment.currency)}</p>
          {dueLater > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {formatAmount(dueLater, payment.currency)} due later
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          {payment.status === "paid"
            ? "Paid"
            : `Due ${payment.dueDate ? formatDate(payment.dueDate) : "no date yet"}`}
        </span>
        {payment.cancellationDeadline &&
          (cancellationSoon ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Cancel by {formatDate(payment.cancellationDeadline)}
            </span>
          ) : (
            <span className="font-medium text-chart-target">
              Free cancellation until {formatDate(payment.cancellationDeadline)}
            </span>
          ))}
      </div>
      <PaymentRowActions
        payment={payment}
        tripId={tripId}
        competitionId={competitionId}
        budgetLineAutoCreated={budgetLine?.autoCreated ?? false}
        otherPaymentsOnBudgetLine={otherPaymentsOnBudgetLine}
        sources={sources}
      />
    </Card>
  );
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
