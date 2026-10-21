-- The traveller's own travel window: the day they leave home and the day
-- they get back. Trip-level, not per scenario -- the stated dates and the
-- competition don't change between scenarios; only routing and
-- activities do.
--
-- departure_date is what buildObligations() now anchors on: money needed
-- during the trip has to be saved before leaving, because it can't be
-- saved from income earned during the trip. Until it's set, the app falls
-- back to the competition's first official day, so existing data keeps
-- working unchanged.
alter table trips
  add column departure_date date,
  add column return_date date,
  add column travel_dates_state info_state not null default 'pending',
  add column travel_dates_source_id uuid references sources (id);

alter table trips
  add constraint trips_return_after_departure
    check (return_date >= departure_date);

-- Same rule as every other dated fact: "confirmed" needs a source...
alter table trips
  add constraint trips_travel_dates_confirmed_needs_source
    check (travel_dates_state <> 'confirmed' or travel_dates_source_id is not null);

-- ...and the dates themselves -- a confirmed claim about nothing isn't
-- one (same reasoning as competitions_confirmed_dates_need_dates).
alter table trips
  add constraint trips_confirmed_travel_dates_need_dates
    check (travel_dates_state <> 'confirmed' or (departure_date is not null and return_date is not null));

-- Setting the window is an UPDATE on an existing trip row, so
-- change_log's trigger needs a reason -- set in the same call, same
-- pattern as update_competition.
create function update_trip_travel_window(
  p_trip_id uuid,
  p_departure_date date,
  p_return_date date,
  p_travel_dates_state info_state,
  p_travel_dates_source_id uuid,
  p_reason text
)
returns trips
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row trips;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update trips
  set departure_date = p_departure_date,
      return_date = p_return_date,
      travel_dates_state = p_travel_dates_state,
      travel_dates_source_id = p_travel_dates_source_id
  where id = p_trip_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Trip % not found (or not yours)', p_trip_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_trip_travel_window(uuid, date, date, info_state, uuid, text) from public, anon;
grant execute on function update_trip_travel_window(uuid, date, date, info_state, uuid, text) to authenticated;
