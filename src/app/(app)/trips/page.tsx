import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import { dataSource } from "@/lib/data";
import type { Trip } from "@/lib/data/types";

import { CreateTripForm } from "../bootstrap-forms";
import { Card } from "../dashboard-ui";
import { formatDate } from "../format";
import { TRIP_STATUS_LABELS } from "../trip-labels";
import { TripRowActions } from "../trips-ui";
import { sortTrips } from "../trip-order";

export const metadata: Metadata = { title: "Trips" };

// Creating a trip when one already exists (the "no_trip" empty state's
// CreateTripForm is otherwise unreachable, Phase 6.10), and the one
// place to rename a trip or change its status -- same split as
// /scenarios one level down.
export default function TripsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Trips</h1>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}>
        <TripsScreen />
      </Suspense>
    </div>
  );
}

async function TripsScreen() {
  await getCurrentUser();
  const trips = sortTrips(await dataSource.getTrips());

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your trips</h2>
        {trips.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No trips yet.</p>
        ) : (
          <div className="space-y-2">
            {trips.map((trip) => (
              <Card key={trip.id}>
                <div className="flex items-start justify-between gap-3">
                  <TripSummary trip={trip} />
                  <Link href={`/?trip=${trip.id}`} className="shrink-0 text-sm font-medium underline">
                    Go to trip
                  </Link>
                </div>
                <TripRowActions trip={trip} />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Add</h2>
        <CreateTripForm />
      </section>
    </div>
  );
}

function TripSummary({ trip }: { trip: Trip }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="font-medium">{trip.name}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{TRIP_STATUS_LABELS[trip.status]}</p>
      {trip.departureDate && trip.returnDate && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatDate(trip.departureDate)} – {formatDate(trip.returnDate)}
        </p>
      )}
    </div>
  );
}
