export type CheckEventLocationTimezoneInput = {
  /** The event's own recorded zone, e.g. Europe/London. */
  eventTimezone: string | null;
  /** The event-kind stay's location's zone. */
  eventStayTimezone: string | null;
};

export type EventLocationTimezoneResult =
  | { status: "unknown" }
  | { status: "ok" }
  | { status: "mismatch"; eventTimezone: string; eventStayTimezone: string };

/**
 * The one conflict worth surfacing once places carry their own zone
 * (20261029090000): an event already records a time zone of its
 * own, and now so does the event stay's location. If those
 * disagree, something is wrong -- an event in a place whose zone
 * differs from the event's own -- and it's reported rather than
 * silently preferring one. Never a block: like every Phase 6.4 check,
 * this is a warning surfaced on the Scenario Overview, not a gate on
 * anything.
 */
export function checkEventLocationTimezone(input: CheckEventLocationTimezoneInput): EventLocationTimezoneResult {
  if (input.eventTimezone === null || input.eventStayTimezone === null) {
    return { status: "unknown" };
  }
  if (input.eventTimezone === input.eventStayTimezone) {
    return { status: "ok" };
  }
  return {
    status: "mismatch",
    eventTimezone: input.eventTimezone,
    eventStayTimezone: input.eventStayTimezone,
  };
}
