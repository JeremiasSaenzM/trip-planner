-- Phase 6.9: the app plans the traveller's trips, not competitions
-- specifically (see CLAUDE.md). A trip may have zero or more events it
-- must be present for -- a competition, a wedding, a conference. No
-- `kind` field: nothing has distinguished one event from another since
-- the acceptance safeguard was removed (20261102090000/20261102100000),
-- and adding a taxonomy nobody asked for would be premature.

alter table competitions rename to events;

alter index competitions_one_selected_per_trip rename to events_one_selected_per_trip;
alter trigger trg_competitions_set_updated_at on events rename to trg_events_set_updated_at;
alter table events rename constraint competitions_end_after_start to events_end_after_start;
alter table events rename constraint competitions_dates_confirmed_needs_source to events_dates_confirmed_needs_source;
alter table events rename constraint competitions_dates_together to events_dates_together;
alter table events rename constraint competitions_confirmed_dates_need_dates to events_confirmed_dates_need_dates;

-- acceptance_status/_decided_on/_source_id existed only for the
-- acceptance safeguard removed by 20261102090000/20261102100000.
-- acceptance_decided_on and acceptance_source_id already had zero
-- readers before that PR (its own orphan report). acceptance_status
-- kept exactly one -- a read-only "Acceptance pending / Accepted /
-- Declined" label on the Scenarios page -- and that display was itself
-- a standing-rule violation, not just unused machinery: D-015 says the
-- system does not track or evaluate whoever decides to attend an
-- event's participation decisions, and whether an event "accepted" the
-- traveller is one. Dropping the column and its display together.
alter table events
  drop column acceptance_status,
  drop column acceptance_decided_on,
  drop column acceptance_source_id;

drop type acceptance_status;

alter table scenarios rename column competition_id to event_id;
alter table scenarios rename constraint scenarios_competition_id_fkey to scenarios_event_id_fkey;

alter table decisions rename column competition_id to event_id;
alter table decisions rename constraint decisions_competition_id_fkey to decisions_event_id_fkey;

alter table open_items rename column competition_id to event_id;
alter table open_items rename constraint open_items_competition_id_fkey to open_items_event_id_fkey;

alter type stay_kind rename value 'festival' to 'event';

alter type proposal_op rename value 'create_competition' to 'create_event';
alter type proposal_op rename value 'update_competition' to 'update_event';

-- update_competition -> update_event: table/error-text change only, same
-- shape of params.
drop function update_competition(uuid, text, text, text, text, date, date, text, info_state, uuid, text);

create function update_event(
  p_id uuid,
  p_name text,
  p_city text,
  p_country text,
  p_venue text,
  p_start_date date,
  p_end_date date,
  p_timezone text,
  p_dates_state info_state,
  p_dates_source_id uuid,
  p_reason text
)
returns events
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row events;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update events
  set name = p_name,
      city = p_city,
      country = p_country,
      venue = p_venue,
      start_date = p_start_date,
      end_date = p_end_date,
      timezone = p_timezone,
      dates_state = p_dates_state,
      dates_source_id = p_dates_source_id
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Event % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_event(
  uuid, text, text, text, text, date, date, text, info_state, uuid, text
) from public, anon;
grant execute on function update_event(
  uuid, text, text, text, text, date, date, text, info_state, uuid, text
) to authenticated;

-- update_scenario: param rename (p_competition_id -> p_event_id) plus
-- its body's table/error text. The type signature
-- (uuid,text,uuid,date,date,info_state,uuid,text) is unchanged, but
-- Postgres refuses to rename an input parameter via CREATE OR REPLACE
-- ("cannot change name of input parameter") -- a drop and recreate is
-- the only way, so this re-grants same as update_event above.
drop function update_scenario(uuid, text, uuid, date, date, info_state, uuid, text);

create function update_scenario(
  p_id uuid,
  p_name text,
  p_event_id uuid,
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

  if p_event_id is not null and not exists (
    select 1 from events where id = p_event_id and trip_id = v_existing.trip_id
  ) then
    raise exception 'Event % not found (or not yours)', p_event_id;
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update scenarios
  set name = p_name,
      event_id = p_event_id,
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
