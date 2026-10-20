import { getCurrentUser } from "@/lib/auth";
import { dataSource } from "@/lib/data";
import { buildExportPayload } from "@/lib/data/build-export";

// The actual file behind /export's "Download my data" link. A plain GET,
// not a Server Action, so the browser can save the response natively via
// Content-Disposition -- no client JS, no Blob/createObjectURL dance.
//
// Every dataSource.getX() call already routes to demo fixtures instead
// of Supabase while DEMO_MODE is on (src/lib/data/index.ts) -- this
// route never checks isDemoMode() itself, so exporting demo data needs
// no special-casing here at all.
export async function GET() {
  await getCurrentUser();

  const [
    trips,
    competitions,
    scenarios,
    sources,
    budgetLines,
    payments,
    savingsEntries,
    fxRates,
    decisions,
    openItems,
    flightOptions,
    flightSegments,
    proposalBatches,
    proposalItems,
    changeLog,
  ] = await Promise.all([
    dataSource.getTrips(),
    dataSource.getCompetitions(),
    dataSource.getScenarios(),
    dataSource.getSources(),
    dataSource.getBudgetLines(),
    dataSource.getPayments(),
    dataSource.getSavingsEntries(),
    dataSource.getFxRates(),
    dataSource.getDecisions(),
    dataSource.getOpenItems(),
    dataSource.getFlightOptions(),
    dataSource.getFlightSegments(),
    dataSource.getProposalBatches(),
    dataSource.getProposalItems(),
    dataSource.getChangeLog(),
  ]);

  const now = new Date();
  const payload = buildExportPayload({
    exportedAt: now.toISOString(),
    trips,
    competitions,
    scenarios,
    sources,
    budgetLines,
    payments,
    savingsEntries,
    fxRates,
    decisions,
    openItems,
    flightOptions,
    flightSegments,
    proposalBatches,
    proposalItems,
    changeLog,
  });

  const filename = `trip-planner-export-${now.toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
