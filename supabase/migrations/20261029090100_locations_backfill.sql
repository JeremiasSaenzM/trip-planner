-- Phase 6.5b, second half: backfill locations from the free text
-- stays/movements already hold, then point both tables at location
-- rows instead of typing the name out again.
--
-- No place names or zone values are written into this file -- real
-- trip data never goes in the repo (CLAUDE.md). Everything below
-- derives purely from whatever strings a given database already holds.
--
-- The old text columns (location, from_location, to_location) are
-- deliberately NOT dropped here. This is a hosted database with no
-- automatic backups (free Supabase plan) -- if this backfill has any
-- bug, a same-migration drop would take the only copy of the original
-- text down with it, with no way back. Once location_id/
-- from_location_id/to_location_id are populated and NOT NULL below,
-- the app reads and writes only those columns; the text columns go
-- instantly inert, sitting there as a safety net until a later,
-- separate migration drops them, after a manual spot-check against
-- production.

-- Matching on name means a trailing space would make a second "Paris"
-- -- the exact defect this phase removes, locked in permanently at
-- cutover -- so this trims before matching. If trimming (or, in the
-- future, case-folding) merges two previously-distinct text values
-- into one location row, that's the correct outcome, but it must not
-- be silent: raise a notice for every case before doing it, so the
-- merge is visible in this migration's own output rather than only
-- inferred later.
do $$
declare
  v_row record;
begin
  for v_row in
    select owner_id, trim(loc) as trimmed_name, array_agg(distinct loc) as originals
    from (
      select owner_id, location as loc from stays
      union all
      select owner_id, from_location as loc from movements
      union all
      select owner_id, to_location as loc from movements
    ) all_location_text
    group by owner_id, trim(loc)
    having count(distinct loc) > 1
  loop
    raise notice 'Locations backfill: trimming merged % distinct values into one location "%" for owner % -- %',
      array_length(v_row.originals, 1), v_row.trimmed_name, v_row.owner_id, v_row.originals;
  end loop;
end;
$$;

insert into locations (owner_id, name)
select distinct owner_id, trim(loc)
from (
  select owner_id, location as loc from stays
  union all
  select owner_id, from_location as loc from movements
  union all
  select owner_id, to_location as loc from movements
) all_location_text
on conflict (owner_id, name) do nothing;

-- The change_log audit trigger requires a reason for any UPDATE/DELETE
-- (change_log_capture()) -- set once, it holds for the rest of this
-- migration's transaction, covering every bulk update below (stays,
-- then both movements columns). Not actor = 'seed': these are real,
-- pre-existing rows, not initial data loading, and the audit log
-- should say what actually happened.
select set_config('app.change_reason',
  'Phase 6.5b migration backfill: populating location_id from the existing location text (20261029090100)', true);

alter table stays add column location_id uuid references locations (id);
update stays s
set location_id = l.id
from locations l
where l.owner_id = s.owner_id and l.name = trim(s.location);
-- Self-verifying: Postgres refuses this outright if any row didn't
-- get matched above, so a backfill bug fails loud here, not silently.
alter table stays alter column location_id set not null;
-- From here on the app writes location_id only (real.ts) -- the old
-- text column is frozen at whatever the backfill produced above, not
-- kept in sync, so a stay created after this migration has nothing to
-- put there. It stays as a read-only snapshot, not a required field.
alter table stays alter column location drop not null;

alter table movements add column from_location_id uuid references locations (id);
update movements m
set from_location_id = l.id
from locations l
where l.owner_id = m.owner_id and l.name = trim(m.from_location);
alter table movements alter column from_location_id set not null;
alter table movements alter column from_location drop not null;

alter table movements add column to_location_id uuid references locations (id);
update movements m
set to_location_id = l.id
from locations l
where l.owner_id = m.owner_id and l.name = trim(m.to_location);
alter table movements alter column to_location_id set not null;
alter table movements alter column to_location drop not null;

-- update_stay/update_movement are full-row replaces; swapping their
-- text location params for id ones changes the signature, so -- same
-- reasoning as 20261028090000 adding flight_option_id -- drop and
-- recreate rather than CREATE OR REPLACE. The old text columns are no
-- longer written here: from this point on they're frozen at whatever
-- the backfill above produced, not kept in sync (see this file's own
-- header for why they aren't dropped yet).
drop function update_stay(
  uuid, text, date, integer, stay_kind, uuid, info_state, uuid, text, uuid, text
);

create function update_stay(
  p_id uuid,
  p_location_id uuid,
  p_start_date date,
  p_nights integer,
  p_kind stay_kind,
  p_budget_line_id uuid,
  p_information_state info_state,
  p_source_id uuid,
  p_notes text,
  p_flight_option_id uuid,
  p_reason text
)
returns stays
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row stays;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update stays
  set location_id = p_location_id,
      start_date = p_start_date,
      nights = p_nights,
      kind = p_kind,
      budget_line_id = p_budget_line_id,
      information_state = p_information_state,
      source_id = p_source_id,
      notes = p_notes,
      flight_option_id = p_flight_option_id
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Stay % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_stay(
  uuid, uuid, date, integer, stay_kind, uuid, info_state, uuid, text, uuid, text
) from public, anon;
grant execute on function update_stay(
  uuid, uuid, date, integer, stay_kind, uuid, info_state, uuid, text, uuid, text
) to authenticated;

drop function update_movement(
  uuid, integer, text, text, date, time, date, time, movement_mode, uuid, text, info_state, uuid, text, uuid, text
);

create function update_movement(
  p_id uuid,
  p_sequence integer,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_depart_date date,
  p_depart_time time,
  p_arrive_date date,
  p_arrive_time time,
  p_mode movement_mode,
  p_budget_line_id uuid,
  p_booking_reference text,
  p_information_state info_state,
  p_source_id uuid,
  p_notes text,
  p_flight_option_id uuid,
  p_reason text
)
returns movements
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row movements;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update movements
  set sequence = p_sequence,
      from_location_id = p_from_location_id,
      to_location_id = p_to_location_id,
      depart_date = p_depart_date,
      depart_time = p_depart_time,
      arrive_date = p_arrive_date,
      arrive_time = p_arrive_time,
      mode = p_mode,
      budget_line_id = p_budget_line_id,
      booking_reference = p_booking_reference,
      information_state = p_information_state,
      source_id = p_source_id,
      notes = p_notes,
      flight_option_id = p_flight_option_id
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Movement % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_movement(
  uuid, integer, uuid, uuid, date, time, date, time, movement_mode, uuid, text, info_state, uuid, text, uuid, text
) from public, anon;
grant execute on function update_movement(
  uuid, integer, uuid, uuid, date, time, date, time, movement_mode, uuid, text, info_state, uuid, text, uuid, text
) to authenticated;

-- Deferred from 20261029090000: the guard this needs (stays.location_id,
-- movements.from_location_id/to_location_id) exists only from this
-- point on. Same shape as delete_budget_line's existing guard.
create function delete_location(p_id uuid, p_reason text)
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

  if exists (select 1 from stays where location_id = p_id) then
    raise exception 'Location % is still used by a stay -- delete or reassign it first.', p_id;
  end if;
  if exists (select 1 from movements where from_location_id = p_id or to_location_id = p_id) then
    raise exception 'Location % is still used by a movement -- delete or reassign it first.', p_id;
  end if;

  delete from locations where id = p_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Location % not found (or not yours)', p_id;
  end if;
end;
$$;

revoke execute on function delete_location(uuid, text) from public, anon;
grant execute on function delete_location(uuid, text) to authenticated;
