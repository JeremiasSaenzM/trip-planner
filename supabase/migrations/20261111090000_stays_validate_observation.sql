-- Phase 6.11a: closes two gaps in 20261110090000's observation trigger.
--
-- (1) The stay side was unguarded. The earlier trigger only fires on
-- writes to accommodation_options, so nothing re-validated an already
-- -dated option when the stay itself moved -- a correctly dated
-- option silently went stale if start_date or nights changed
-- afterwards. This is the exact mechanism behind the production
-- defect this phase was written for: a stay moved, the figure behind
-- it didn't move with it, and nothing noticed for two weeks.
--
-- (2) The validation failed open. `select ... into v_stay` leaves
-- v_stay null when the stay can't be found, and every comparison
-- against a null then evaluates to null rather than true, so the
-- `if ... then raise` never fires and the write goes through
-- unchecked. A check that cannot see its input must refuse, not wave
-- the write through.
--
-- The month/day comparison itself is pulled out into one shared
-- function so both triggers -- this one and 20261110090000's -- call
-- the same logic rather than each keeping their own copy.

create function accommodation_observation_mismatch(
  p_option_nights integer,
  p_observed_start_date date,
  p_stay_nights integer,
  p_stay_start_date date
) returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Undated: a guide price, not evidence for any specific night --
  -- nothing to check.
  if p_observed_start_date is null then
    return null;
  end if;

  if p_option_nights <> p_stay_nights then
    return 'night_count_differs';
  end if;

  -- Month and day only, never the year: A-009 deliberately carries a
  -- whole year's observations forward as next year's placeholders,
  -- and that sanctioned shift must never be flagged -- only a genuine
  -- day/month slip (the actual defect) does.
  if extract(month from p_observed_start_date) <> extract(month from p_stay_start_date)
     or extract(day from p_observed_start_date) <> extract(day from p_stay_start_date) then
    return 'dates_differ';
  end if;

  return null;
end;
$$;

-- Restates 20261110090000's trigger function: same behaviour, now
-- calling the shared comparison above, and raising instead of
-- silently passing when the stay can't be found (gap 2).
create or replace function trg_accommodation_options_validate_observation_fn()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stay stays;
  v_mismatch text;
begin
  if new.observed_start_date is null then
    return new;
  end if;

  select * into v_stay from stays where id = new.stay_id;
  if v_stay.id is null then
    raise exception
      'Accommodation option''s stay could not be found -- a dated observation needs a stay to check it against.';
  end if;

  v_mismatch := accommodation_observation_mismatch(new.nights, new.observed_start_date, v_stay.nights, v_stay.start_date);

  if v_mismatch = 'night_count_differs' then
    raise exception
      'This rate was observed for % night(s), but the stay is % night(s) -- an accommodation figure must be backed by the nights it funds.',
      new.nights, v_stay.nights;
  elsif v_mismatch = 'dates_differ' then
    raise exception
      'This rate was observed for % to %, but the stay runs % to % -- an accommodation figure must be backed by the nights it funds.',
      new.observed_start_date, new.observed_start_date + new.nights,
      v_stay.start_date, v_stay.start_date + v_stay.nights;
  end if;

  return new;
end;
$$;

-- Gap 1: the stay side. The WHEN clause (not a check inside the
-- function body) is what limits this to an actual move -- visible
-- from pg_trigger without reading the function, and it means the
-- loop below never runs on an edit that leaves start_date and nights
-- alone. Checks every accommodation_option already attached to this
-- stay against where it's about to move to, and names the option
-- that would break so the fix is obvious: correct it, or detach it
-- from this stay first.
create function trg_stays_validate_observation_fn()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_option accommodation_options;
  v_mismatch text;
begin
  for v_option in
    select * from accommodation_options where stay_id = new.id and observed_start_date is not null
  loop
    v_mismatch := accommodation_observation_mismatch(
      v_option.nights, v_option.observed_start_date, new.nights, new.start_date
    );
    if v_mismatch is not null then
      raise exception
        'Moving this stay would leave accommodation option "%" (observed % for % night(s)) without a valid window -- correct it or detach it from this stay first.',
        v_option.label, v_option.observed_start_date, v_option.nights;
    end if;
  end loop;

  return new;
end;
$$;

create trigger trg_stays_validate_observation
before update on stays
for each row
when (new.start_date is distinct from old.start_date or new.nights is distinct from old.nights)
execute function trg_stays_validate_observation_fn();
