-- Phase 6.4: a scenario's structured itinerary -- stays and movements.
-- Night counts used to live only as prose inside budget-line
-- descriptions, where a mismatch between the plan's assumed trip length
-- and what's actually scheduled (a 21-night budget priced with an
-- 11-night air fare, say) stayed invisible. This phase came from using
-- the app, not from the original build plan.
--
-- Movements are stored, not derived from stays: a routing choice has to
-- be visible as something other than a differently-named budget line,
-- and a future hard-constraint check (the US/Canada stop rule, Phase
-- 6.5) needs real legs to apply to, not an inference from where someone
-- slept. Movements form a chain -- home, out to wherever the stays are,
-- home again -- tracked by this table's own `sequence`, independent of
-- the stays table.
--
-- Boundary with flight_options/flight_segments (Phase 6.5): those record
-- the purchased international ticket (fare rules, baggage, Effective
-- Flight Cost). movements record every leg actually travelled end to
-- end, including a short regional hop (London -> Paris) that's never
-- its own ticket purchase and has no fare rules of its own to track.
--
-- Both tables get a nullable source_id now, with no "confirmed needs a
-- source" constraint yet: a movement's time and operator come from a
-- timetable, and once either table carries information_state =
-- 'confirmed' there's a booking confirmation behind it, which is a
-- source (00 Sec4). The column exists so recording a real booking later
-- doesn't need a migration; nothing enforces filling it in yet.

create type stay_kind as enum ('festival', 'independent', 'transit');
create type movement_mode as enum ('plane', 'train', 'bus', 'ferry', 'car', 'other');

create table stays (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  scenario_id uuid not null references scenarios (id) on delete cascade,
  location text not null,
  start_date date not null,
  nights smallint not null,
  kind stay_kind not null default 'independent',
  budget_line_id uuid references budget_lines (id),
  information_state info_state not null default 'estimate',
  source_id uuid references sources (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stays_nights_positive check (nights > 0)
);

create trigger trg_stays_set_updated_at
before update on stays
for each row execute function trigger_set_updated_at();

alter table stays enable row level security;

create policy "owner_all" on stays
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

revoke all on table stays from anon, authenticated, service_role;
grant select, insert, update, delete on table stays to authenticated, service_role;

create trigger trg_stays_audit after insert or update or delete on stays
  for each row execute function change_log_capture();

-- One leg of travel within the trip, home to home. `sequence` is the
-- explicit order along the chain -- continuity (each leg's from_location
-- matching the previous leg's to_location) is a warning the app checks,
-- not something this table enforces, since a mid-edit chain is
-- momentarily inconsistent and that's fine. arrive_date is its own
-- column rather than derived from depart_date so an overnight leg can
-- cross midnight with nobody needing a bed for that night.
create table movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  scenario_id uuid not null references scenarios (id) on delete cascade,
  sequence smallint not null,
  from_location text not null,
  to_location text not null,
  depart_date date not null,
  depart_time time,
  arrive_date date not null,
  arrive_time time,
  mode movement_mode not null default 'plane',
  budget_line_id uuid references budget_lines (id),
  booking_reference text,
  information_state info_state not null default 'estimate',
  source_id uuid references sources (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movements_arrive_after_depart check (arrive_date >= depart_date),
  constraint movements_sequence_unique unique (scenario_id, sequence)
);

create trigger trg_movements_set_updated_at
before update on movements
for each row execute function trigger_set_updated_at();

alter table movements enable row level security;

create policy "owner_all" on movements
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

revoke all on table movements from anon, authenticated, service_role;
grant select, insert, update, delete on table movements to authenticated, service_role;

create trigger trg_movements_audit after insert or update or delete on movements
  for each row execute function change_log_capture();

-- Creating a stay or a movement stays a plain insert from the app
-- (nothing existed before to justify changing, same reasoning as
-- create_budget_line) -- only edits and deletes get an RPC here.

-- p_nights is integer, not smallint like the column it's written into:
-- Postgres's function-overload resolution only accepts implicit casts,
-- and int4 -> int2 is assignment-only -- a bare integer literal (or an
-- RPC call passing a plain number) would make this function "not
-- exist" if the parameter itself were smallint. The UPDATE's own
-- assignment into the smallint column still narrows it, same as this
-- rule's INSERT already does.
create or replace function update_stay(
  p_id uuid,
  p_location text,
  p_start_date date,
  p_nights integer,
  p_kind stay_kind,
  p_budget_line_id uuid,
  p_information_state info_state,
  p_source_id uuid,
  p_notes text,
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
  set location = p_location,
      start_date = p_start_date,
      nights = p_nights,
      kind = p_kind,
      budget_line_id = p_budget_line_id,
      information_state = p_information_state,
      source_id = p_source_id,
      notes = p_notes
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Stay % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_stay(
  uuid, text, date, integer, stay_kind, uuid, info_state, uuid, text, text
) from public, anon;
grant execute on function update_stay(
  uuid, text, date, integer, stay_kind, uuid, info_state, uuid, text, text
) to authenticated;

create or replace function delete_stay(p_id uuid, p_reason text)
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

  delete from stays where id = p_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Stay % not found (or not yours)', p_id;
  end if;
end;
$$;

revoke execute on function delete_stay(uuid, text) from public, anon;
grant execute on function delete_stay(uuid, text) to authenticated;

-- p_sequence is integer for the same reason p_nights is in
-- update_stay above.
create or replace function update_movement(
  p_id uuid,
  p_sequence integer,
  p_from_location text,
  p_to_location text,
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
      from_location = p_from_location,
      to_location = p_to_location,
      depart_date = p_depart_date,
      depart_time = p_depart_time,
      arrive_date = p_arrive_date,
      arrive_time = p_arrive_time,
      mode = p_mode,
      budget_line_id = p_budget_line_id,
      booking_reference = p_booking_reference,
      information_state = p_information_state,
      source_id = p_source_id,
      notes = p_notes
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Movement % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_movement(
  uuid, integer, text, text, date, time, date, time, movement_mode, uuid, text, info_state, uuid, text, text
) from public, anon;
grant execute on function update_movement(
  uuid, integer, text, text, date, time, date, time, movement_mode, uuid, text, info_state, uuid, text, text
) to authenticated;

create or replace function delete_movement(p_id uuid, p_reason text)
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

  delete from movements where id = p_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Movement % not found (or not yours)', p_id;
  end if;
end;
$$;

revoke execute on function delete_movement(uuid, text) from public, anon;
grant execute on function delete_movement(uuid, text) to authenticated;

-- Extends delete_budget_line's existing guard (20261015110000) so a
-- line that's still priced into a stay or a movement gets the same
-- friendly refusal a line with payments attached already gets, rather
-- than a raw foreign-key error -- these two tables didn't exist when
-- that guard was written, so without this a line referenced by either
-- one would fail with Postgres's own constraint-violation text instead.
create or replace function delete_budget_line(p_id uuid, p_reason text)
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

  if exists (select 1 from payments where budget_line_id = p_id) then
    raise exception 'Budget line % still has payments attached -- delete or reassign them first.', p_id;
  end if;
  if exists (select 1 from stays where budget_line_id = p_id) then
    raise exception 'Budget line % still has stays attached -- delete or reassign them first.', p_id;
  end if;
  if exists (select 1 from movements where budget_line_id = p_id) then
    raise exception 'Budget line % still has movements attached -- delete or reassign them first.', p_id;
  end if;

  delete from budget_lines where id = p_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Budget line % not found (or not yours)', p_id;
  end if;
end;
$$;

revoke execute on function delete_budget_line(uuid, text) from public, anon;
grant execute on function delete_budget_line(uuid, text) to authenticated;
