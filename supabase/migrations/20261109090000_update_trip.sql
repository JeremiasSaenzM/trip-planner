-- Phase 6.10: creating a trip already had createTrip/create_trip-shaped
-- support (bootstrap_trip form), but renaming one or changing its status
-- had no write path at all -- only update_trip_travel_window, which is
-- deliberately narrower (20261022090000_trip_travel_window.sql). This
-- fills that gap with the same full-row-replace pattern update_scenario
-- uses for the fields it owns: name and status here, never the travel
-- window, which stays update_trip_travel_window's own.
create function update_trip(
  p_id uuid,
  p_name text,
  p_status trip_status,
  p_reason text
)
returns trips
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing trips;
  v_row trips;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  select * into v_existing from trips where id = p_id;
  if v_existing.id is null then
    raise exception 'Trip % not found (or not yours)', p_id;
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update trips
  set name = p_name,
      status = p_status
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function update_trip(uuid, text, trip_status, text) from public, anon;
grant execute on function update_trip(uuid, text, trip_status, text) to authenticated;
