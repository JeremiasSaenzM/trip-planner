-- Phase 6.5b: locations and time zones.
--
-- Movements store a bare date and clock reading with no zone, so
-- elapsed time across a leg that crosses a time-zone boundary is wrong
-- by the offset -- travelling west (Paris -> London, the traveller's
-- own common route) this understates the true elapsed time, the unsafe
-- direction for the festival-presence check (hard constraint 2). A
-- time zone isn't a property of a movement, it's a property of the
-- place -- so this gives places an identity of their own, rather than
-- adding a zone column to movements and creating a second defect
-- (stays.location and movements.from_location/to_location are free
-- text, the same place written out many times across both tables; a
-- zone would then live on one table only, and the same place could
-- carry a zone in one row and not another).
--
-- owner_id-scoped, not trip_id: the same reasoning that makes "Paris"
-- reusable across a trip's scenarios makes "Home" reusable across
-- every trip this app will ever plan -- under trip_id scoping, Home
-- would be re-entered by hand, with its zone, once per trip, exactly
-- the duplication this phase exists to remove, just moved up a level.
-- This also matches sources and fx_rates, already owner-scoped rather
-- than trip-scoped (proposal_ref's 'source' branch, 20261028090100).
create table locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  name text not null,
  -- IANA zone name, e.g. "Europe/Paris" -- validated against
  -- pg_timezone_names below. Nullable: the zone can't be derived from
  -- a name, so the backfill (next migration) leaves it null, and a
  -- location without one is a visible gap, not a guess.
  timezone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_name_unique unique (owner_id, name)
);

-- pg_timezone_names is a view, not a table a check constraint can
-- reference (Postgres check constraints only see the row's own
-- columns) -- so the validation the spec asks for ("Europe/Pairs is
-- rejected at write time") has to be a trigger, not a constraint.
create function trg_locations_validate_timezone_fn()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.timezone is not null and not exists (
    select 1 from pg_timezone_names where name = new.timezone
  ) then
    raise exception 'Not a recognized time zone: %', new.timezone;
  end if;
  return new;
end;
$$;

create trigger trg_locations_validate_timezone
before insert or update on locations
for each row execute function trg_locations_validate_timezone_fn();

create trigger trg_locations_set_updated_at
before update on locations
for each row execute function trigger_set_updated_at();

alter table locations enable row level security;

create policy "owner_all" on locations
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

revoke all on table locations from anon, authenticated, service_role;
grant select, insert, update, delete on table locations to authenticated, service_role;

create trigger trg_locations_audit after insert or update or delete on locations
  for each row execute function change_log_capture();

create function update_location(
  p_id uuid,
  p_name text,
  p_timezone text,
  p_notes text,
  p_reason text
)
returns locations
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row locations;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update locations
  set name = p_name,
      timezone = p_timezone,
      notes = p_notes
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Location % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_location(uuid, text, text, text, text) from public, anon;
grant execute on function update_location(uuid, text, text, text, text) to authenticated;

-- delete_location isn't defined here: with check_function_bodies on
-- (the default), CREATE FUNCTION validates that every table/column a
-- function body references already exists, and the guard this needs
-- (stays.location_id, movements.from_location_id/to_location_id)
-- doesn't until the next migration adds it. It's defined there
-- instead, right after those columns land.

-- New proposal ops, added here on their own: a newly-added enum value
-- can't be referenced in the same transaction that adds it (the same
-- split already used for create_flight_option et al., 20261028090000/
-- ...090100). Nothing in this file uses these values yet.
alter type proposal_op add value 'create_location';
alter type proposal_op add value 'update_location';
