export type FlightSegmentTimingInput = {
  direction: "outbound" | "return";
  segmentOrder: number;
  /** ISO-8601 instant. */
  departAt: string;
  arriveAt: string;
};

export type FlightOptionTiming = {
  /** ISO-8601 instant the last outbound segment lands -- null when there
   * are no outbound segments recorded yet. */
  outboundArrivalAt: string | null;
  /** ISO-8601 instant the first return segment departs -- null for a
   * one-way option, or a round trip whose return leg isn't entered yet.
   * Not consumed by any check yet -- kept for the "catches the flight"
   * check (does the traveller reach the departure airport in time for
   * this option), deliberately deferred as its own, non-hard-constraint
   * question. See the comment below this type for why it isn't just
   * dropped and re-derived later. */
  returnDepartureAt: string | null;
};

/**
 * flight_options.arrival_at used to duplicate this, with nothing
 * checking the two agreed -- dropped (20261028090000). Derived instead,
 * straight from the segments checkUsCanadaStop already treats as the
 * only source of truth for a stop: the last outbound segment's landing
 * is the option's own arrival, the first return segment's departure is
 * when it leaves again. Feeds checkFestivalArrivalDeparture's
 * outboundArrivalAt directly. returnDepartureAt isn't currently used
 * there -- the festival-departure half of that check reads when the
 * traveller leaves the festival location, not this flight's own
 * departure (see findFestivalDeparture). It's kept, not dropped,
 * because this is exactly the shape that lost the naive-local-time
 * caveat for two PRs: a value derived, attached to a type, and never
 * wired anywhere, so nothing noticed it needed the caveat until it
 * was actually read. Named here so it doesn't go quiet the same way:
 * returnDepartureAt is for the future "catches the flight" check
 * (Build plan, Phase 6.5) and nothing else.
 */
export function resolveFlightOptionTiming(segments: FlightSegmentTimingInput[]): FlightOptionTiming {
  const outbound = segments
    .filter((segment) => segment.direction === "outbound")
    .sort((a, b) => a.segmentOrder - b.segmentOrder);
  const inbound = segments
    .filter((segment) => segment.direction === "return")
    .sort((a, b) => a.segmentOrder - b.segmentOrder);

  return {
    outboundArrivalAt: outbound.length > 0 ? outbound[outbound.length - 1].arriveAt : null,
    returnDepartureAt: inbound.length > 0 ? inbound[0].departAt : null,
  };
}
