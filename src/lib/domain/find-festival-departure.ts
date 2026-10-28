import { earliestPossibleInstant, latestPossibleInstant } from "./calculate-onward-travel-minutes";

export type FestivalDepartureMovement = {
  sequence: number;
  fromLocation: string;
  departDate: string;
  departTime: string | null;
};

export type FindFestivalDepartureInput = {
  /** This scenario's full movement chain, any order. */
  movements: FestivalDepartureMovement[];
  /** The festival-kind stay's location -- null when no festival-kind
   * stay is recorded yet. */
  festivalStayLocation: string | null;
  /** The festival's own IANA zone. The departing movement's own local
   * clock reading is interpreted as being in this zone -- it departs
   * from the festival's own location, so that's the zone it's actually
   * in, not an approximation the way summing several legs' naive times
   * would be. */
  timezone: string | null;
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
 * Found as the LAST movement, by sequence, whose fromLocation is the
 * festival stay -- not the first, so a day trip out and back during the
 * festival isn't mistaken for leaving it for good.
 */
export function findFestivalDeparture(input: FindFestivalDepartureInput): FestivalDepartureResult {
  if (input.festivalStayLocation === null) {
    return { status: "unknown", reason: "no festival-kind stay recorded to depart from" };
  }
  if (input.timezone === null) {
    return { status: "unknown", reason: "competition has no time zone recorded yet" };
  }

  const sorted = [...input.movements].sort((a, b) => a.sequence - b.sequence);
  let departureIndex = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].fromLocation === input.festivalStayLocation) {
      departureIndex = i;
      break;
    }
  }
  if (departureIndex === -1) {
    return { status: "unknown", reason: "the movement chain never leaves the festival stay's location" };
  }

  const departure = sorted[departureIndex];
  const zone = input.timezone;

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
