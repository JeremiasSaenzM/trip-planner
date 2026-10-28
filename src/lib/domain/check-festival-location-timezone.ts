export type CheckFestivalLocationTimezoneInput = {
  /** The competition's own recorded zone, e.g. Europe/London. */
  competitionTimezone: string | null;
  /** The festival-kind stay's location's zone. */
  festivalStayTimezone: string | null;
};

export type FestivalLocationTimezoneResult =
  | { status: "unknown" }
  | { status: "ok" }
  | { status: "mismatch"; competitionTimezone: string; festivalStayTimezone: string };

/**
 * The one conflict worth surfacing once places carry their own zone
 * (20261029090000): a competition already records a time zone of its
 * own, and now so does the festival stay's location. If those
 * disagree, something is wrong -- a festival in a place whose zone
 * differs from the competition's own -- and it's reported rather than
 * silently preferring one. Never a block: like every Phase 6.4 check,
 * this is a warning surfaced on the Scenario Overview, not a gate on
 * anything.
 */
export function checkFestivalLocationTimezone(input: CheckFestivalLocationTimezoneInput): FestivalLocationTimezoneResult {
  if (input.competitionTimezone === null || input.festivalStayTimezone === null) {
    return { status: "unknown" };
  }
  if (input.competitionTimezone === input.festivalStayTimezone) {
    return { status: "ok" };
  }
  return {
    status: "mismatch",
    competitionTimezone: input.competitionTimezone,
    festivalStayTimezone: input.festivalStayTimezone,
  };
}
