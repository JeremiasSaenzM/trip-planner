import { earliestPossibleInstant, latestPossibleInstant } from "./calculate-onward-travel-minutes";

export type FestivalDepartureMovement = {
  sequence: number;
  fromLocationId: string;
  // The IANA zone of fromLocationId, resolved by the caller from the
  // locations table. The departing movement's own local clock reading
  // is interpreted as being in this zone -- it departs from the
  // festival's own location, so that's the zone it's actually in, not
  // an approximation the way summing several legs' naive times would
  // be. Null when that location doesn't have a zone recorded yet.
  fromZone: string | null;
  departDate: string;
  departTime: string | null;
};

export type FindFestivalDepartureInput = {
  /** This scenario's full movement chain, any order. */
  movements: FestivalDepartureMovement[];
  /** The festival-kind stay's location id -- null when no festival-kind
   * stay is recorded yet. */
  festivalStayLocationId: string | null;
};

export type FestivalDepartureResult =
  | { status: "unknown"; reason: string }
  | { status: "known"; departsAt: string }
  | { status: "bounded"; earliestDepartsAt: string; latestDepartsAt: string };

/**
 * When the traveller leaves the festival-kind stay's location -- hard
 * constraint 2's departure half, "depart only after the final official
 * festival day has ended" (04 §3.2). That's a question about departure
 * from the festival, answered entirely by the scenario's own movement
 * chain: the same regardless of which flight option is being evaluated,
 * and with no travel-to-airport term, because making a later flight is
 * a different question this doesn't answer (deliberately not built
 * here -- see the Phase 6.5 discussion).
 *
 * Found as the LAST movement, by sequence, whose fromLocationId is the
 * festival stay -- not the first, so a day trip out and back during the
 * festival isn't mistaken for leaving it for good.
 */
export function findFestivalDeparture(input: FindFestivalDepartureInput): FestivalDepartureResult {
  if (input.festivalStayLocationId === null) {
    return { status: "unknown", reason: "no festival-kind stay recorded to depart from" };
  }

  const sorted = [...input.movements].sort((a, b) => a.sequence - b.sequence);
  let departureIndex = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].fromLocationId === input.festivalStayLocationId) {
      departureIndex = i;
      break;
    }
  }
  if (departureIndex === -1) {
    return { status: "unknown", reason: "the movement chain never leaves the festival stay's location" };
  }

  const departure = sorted[departureIndex];
  if (departure.fromZone === null) {
    return { status: "unknown", reason: "the departure location has no time zone recorded yet" };
  }
  const zone = departure.fromZone;

  if (departure.departTime !== null) {
    const departsAt = earliestPossibleInstant(departure.departDate, departure.departTime).setZone(zone, {
      keepLocalTime: true,
    });
    return { status: "known", departsAt: departsAt.toISO() as string };
  }

  const earliestDepartsAt = earliestPossibleInstant(departure.departDate, null).setZone(zone, { keepLocalTime: true });
  const latestDepartsAt = latestPossibleInstant(departure.departDate, null).setZone(zone, { keepLocalTime: true });
  return {
    status: "bounded",
    earliestDepartsAt: earliestDepartsAt.toISO() as string,
    latestDepartsAt: latestDepartsAt.toISO() as string,
  };
}
