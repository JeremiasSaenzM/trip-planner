-- More than one competition and scenario per trip: a competition can be
-- recorded before its host city or festival dates are announced, and
-- competitions/scenarios can now be edited (and scenarios deleted) with
-- a reason, the same way budget lines and payments already can.

-- A competition whose host or dates aren't announced yet is still worth
-- costing. Every reader in the app already copes with a missing
-- competition (no departure date -> no savings requirement), and now
-- copes with a competition that has no dates the same way.
alter table competitions
  alter column city drop not null,
  alter column country drop not null,
  alter column start_date drop not null,
  alter column end_date drop not null,
  alter column timezone drop not null;

-- A festival period needs both ends to mean anything (the traveler is
-- present from the first through the final official day, inclusive) --
-- a start date with no end, or the reverse, can't define it.
-- competitions_end_after_start still applies whenever both are set
-- (a check with a null operand passes).
alter table competitions
  add constraint competitions_dates_together
    check ((start_date is null) = (end_date is null));

-- "Confirmed" dates with no dates at all would be a confirmed claim
-- about nothing -- a source alone isn't enough.
alter table competitions
  add constraint competitions_confirmed_dates_need_dates
    check (dates_state <> 'confirmed' or start_date is not null);

-- Edits go through RPCs that set app.change_reason in the same call
-- change_log's trigger checks it in -- same pattern as
-- update_budget_line. acceptance_status/acceptance_* and is_selected
-- are deliberately not parameters: accepting a competition lifts the
-- non-refundable-payment safeguard (hard constraint 3), so it gets its
-- own deliberate flow, not a field among others in a general edit.
create function update_competition(
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
returns competitions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row competitions;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update competitions
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
    raise exception 'Competition % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_competition(
  uuid, text, text, text, text, date, date, text, info_state, uuid, text
) from public, anon;
grant execute on function update_competition(
  uuid, text, text, text, text, date, date, text, info_state, uuid, text
) to authenticated;

-- Rename a scenario, or link/change/unlink its competition.
--
-- enforce_payment_acceptance_safeguard() only runs when a *payment* is
-- written, and it looks up the competition through the payment's
-- scenario. Re-pointing a scenario that already holds a committed or
-- paid non-refundable competition-related payment would silently move
-- that commitment under a different (possibly not accepted)
-- competition, without the safeguard ever re-checking it. So changing
-- the competition is refused while such a payment exists; renaming
-- alone is always fine.
create function update_scenario(
  p_id uuid,
  p_name text,
  p_competition_id uuid,
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

  if p_competition_id is distinct from v_existing.competition_id and exists (
    select 1
    from payments p
    left join budget_lines bl on bl.id = p.budget_line_id
    where coalesce(p.scenario_id, bl.scenario_id) = p_id
      and p.status in ('committed', 'paid')
      and p.competition_related
      and p.refundability in ('non_refundable', 'unknown')
  ) then
    raise exception 'Scenario % has committed non-refundable competition payments -- its competition can''t be changed.', p_id;
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update scenarios
  set name = p_name,
      competition_id = p_competition_id
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function update_scenario(uuid, text, uuid, text) from public, anon;
grant execute on function update_scenario(uuid, text, uuid, text) to authenticated;

-- Refuses while anything still references the scenario. budget_lines
-- and payments have no cascade (the delete would just fail on the
-- foreign key), but flight_options.scenario_id is "on delete cascade" --
-- without this guard, deleting a scenario would silently delete its
-- flight options and their segments with it.
create function delete_scenario(p_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_deleted_id uuid;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  if exists (select 1 from budget_lines where scenario_id = p_id) then
    raise exception 'Scenario % still has budget lines -- delete them first.', p_id;
  end if;

  if exists (select 1 from payments where scenario_id = p_id) then
    raise exception 'Scenario % still has payments -- delete them first.', p_id;
  end if;

  if exists (select 1 from flight_options where scenario_id = p_id) then
    raise exception 'Scenario % still has flight options -- delete them first.', p_id;
  end if;

  delete from scenarios where id = p_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Scenario % not found (or not yours)', p_id;
  end if;
end;
$$;

revoke execute on function delete_scenario(uuid, text) from public, anon;
grant execute on function delete_scenario(uuid, text) to authenticated;
