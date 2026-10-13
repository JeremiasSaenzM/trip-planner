import type { Metadata } from "next";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import type { Payment } from "@/lib/data/types";

import { DashboardControls } from "../dashboard-controls";
import { loadDashboardData } from "../dashboard-data";
import { Card, EmptyState } from "../dashboard-ui";
import { formatAmount, formatDate } from "../format";

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

  const { payments, competition, asOfDate } = data;

  if (payments.length === 0) {
    return (
      <div className="space-y-6">
        <DashboardControls
          basePath="/payments"
          scenarios={data.scenarios}
          activeScenarioId={data.scenario.id}
          basis={data.basis}
        />
        <EmptyState>No payments recorded for this scenario yet.</EmptyState>
      </div>
    );
  }

  const canSplit = competition !== null;
  const preTrip = canSplit
    ? payments.filter((p) => p.dueDate === null || p.dueDate < competition.startDate)
    : payments;
  const duringTrip = canSplit ? payments.filter((p) => p.dueDate !== null && p.dueDate >= competition.startDate) : [];

  return (
    <div className="space-y-6">
      <DashboardControls
        basePath="/payments"
        scenarios={data.scenarios}
        activeScenarioId={data.scenario.id}
        basis={data.basis}
      />

      {!canSplit && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No departure date yet for this scenario, so payments aren&apos;t split by pre-trip/during-trip.
        </p>
      )}

      <PaymentGroup title="Due before you leave" payments={preTrip} asOfDate={asOfDate} />
      {canSplit && <PaymentGroup title="Due during the trip" payments={duringTrip} asOfDate={asOfDate} />}
    </div>
  );
}

function PaymentGroup({ title, payments, asOfDate }: { title: string; payments: Payment[]; asOfDate: string }) {
  if (payments.length === 0) return null;

  const sorted = [...payments].sort((a, b) => (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99"));

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h2>
      <div className="space-y-2">
        {sorted.map((payment) => (
          <PaymentRow key={payment.id} payment={payment} asOfDate={asOfDate} />
        ))}
      </div>
    </div>
  );
}

function PaymentRow({ payment, asOfDate }: { payment: Payment; asOfDate: string }) {
  const dueLater = payment.totalAmount - payment.paidAmount;
  const cancellationSoon =
    payment.cancellationDeadline !== null &&
    payment.cancellationDeadline >= asOfDate &&
    payment.cancellationDeadline <= addDays(asOfDate, 30);

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
        <span>Due {payment.dueDate ? formatDate(payment.dueDate) : "no date yet"}</span>
        {payment.cancellationDeadline && (
          <span
            className={
              cancellationSoon
                ? "rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : undefined
            }
          >
            Cancel by {formatDate(payment.cancellationDeadline)}
          </span>
        )}
      </div>
    </Card>
  );
}

const STATUS_LABELS: Record<Payment["status"], string> = {
  planned: "Planned",
  committed: "Committed",
  paid: "Paid",
  cancelled: "Cancelled",
};

const TIMING_LABELS: Record<Payment["timingType"], string> = {
  paid_now: "Paid now",
  due_on_date: "Due on date",
  pay_before_arrival: "Pay before arrival",
  pay_at_property: "Pay at property",
  unknown: "Timing unknown",
  optional: "Optional",
};

const REFUNDABILITY_LABELS: Record<Payment["refundability"], string> = {
  refundable: "Refundable",
  partially_refundable: "Partially refundable",
  non_refundable: "Non-refundable",
  unknown: "Refundability unknown",
};

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
