-- Phase 6.7: scenario travel windows. The travel window has lived only on
-- trips (20261022090000) -- every scenario shared it, so two scenarios
-- could never differ in *when* the trip happens, which is exactly the
-- comparison this app exists for (a fare for 2-25 July vs. 5-20 July).
--
-- All four columns nullable, same shape as trips' own. Null means "inherit
-- the trip's window" -- what every existing scenario does today, with no
-- data change. resolveTravelWindow() (src/lib/domain/) is the one place
-- that decides which wins; nothing else reads either table's dates
-- directly (see that function's own comment).
alter table scenarios
  add column departure_date date,
  add column return_date date,
  add column travel_dates_state info_state not null default 'pending',
  add column travel_dates_source_id uuid references sources (id);

-- Stricter than trips' own window (trips_return_after_departure alone
-- allows one date without the other outside 'confirmed'): a scenario's
-- override is deliberately all-or-nothing, so there's no state where it
-- half-overrides the trip. This also removes any ambiguity for
-- resolveTravelWindow() about which single field to check.
alter table scenarios
  add constraint scenarios_travel_dates_together
    check ((departure_date is null) = (return_date is null));

-- Same rule as trips_return_after_departure.
alter table scenarios
  add constraint scenarios_return_after_departure
    check (return_date >= departure_date);

-- Same two rules as trips_travel_dates_confirmed_needs_source /
-- trips_confirmed_travel_dates_need_dates: a confirmed claim needs both a
-- source and something to be confirmed about.
alter table scenarios
  add constraint scenarios_travel_dates_confirmed_needs_source
    check (travel_dates_state <> 'confirmed' or travel_dates_source_id is not null);
alter table scenarios
  add constraint scenarios_confirmed_travel_dates_need_dates
    check (travel_dates_state <> 'confirmed' or (departure_date is not null and return_date is not null));

-- update_scenario is a full-row replace, so the four new fields change its
-- identity -- dropped and recreated, same as every other signature change
-- in this project. Clearing an override is just a call with all four null;
-- nothing server-side distinguishes "clearing" from "setting" -- the UI is
-- what keeps a blank-field accident from reaching this call (see
-- scenario-actions.ts).
drop function update_scenario(uuid, text, uuid, text);

create function update_scenario(
  p_id uuid,
  p_name text,
  p_competition_id uuid,
  p_departure_date date,
  p_return_date date,
  p_travel_dates_state info_state,
  p_travel_dates_source_id uuid,
  p_reason text
)
returns scenarios
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing scenarios;
  v_row scenarios;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  select * into v_existing from scenarios where id = p_id;
  if v_existing.id is null then
    raise exception 'Scenario % not found (or not yours)', p_id;
  end if;

  if p_competition_id is not null and not exists (
    select 1 from competitions where id = p_competition_id and trip_id = v_existing.trip_id
  ) then
    raise exception 'Competition % not found (or not yours)', p_competition_id;
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update scenarios
  set name = p_name,
      competition_id = p_competition_id,
      departure_date = p_departure_date,
      return_date = p_return_date,
      travel_dates_state = p_travel_dates_state,
      travel_dates_source_id = p_travel_dates_source_id
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function update_scenario(
  uuid, text, uuid, date, date, info_state, uuid, text
) from public, anon;
grant execute on function update_scenario(
  uuid, text, uuid, date, date, info_state, uuid, text
) to authenticated;
