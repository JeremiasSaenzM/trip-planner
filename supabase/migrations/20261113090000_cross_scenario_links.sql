-- Closes the cross-scenario link gap. payments already refused a
-- payment whose own scenario disagreed with its budget line's
-- (enforce_payment_scenario_consistency, 20261012130900) -- stays and
-- movements had no equivalent, on either of their own two links
-- (budget_line_id, flight_option_id). A stay or movement could be
-- attached to another scenario's budget line or flight option and
-- nothing objected: every foreign key was satisfied, so the write
-- went through.
--
-- How it bit, in production: an import batch created budget lines on
-- the wrong scenario (a wrong UUID in the paste), then attached the
-- intended scenario's stays to them. Every layer accepted it. Only
-- symptom: the stay edit form showing "No budget line yet", because
-- the picker lists only that scenario's own lines.
--
-- One shared check, not a third copy of this rule (payments' own
-- version would have made two). assert_same_scenario() is the one
-- place "do these two scenario ids agree" lives; every caller below
-- -- the restated payments trigger, and the two new stays/movements
-- triggers -- calls it instead of comparing ids itself. It allows
-- either side being null: budget_lines.scenario_id is nullable (a
-- trip-level line legitimately serves every scenario), and this is
-- where that's honoured. flight_options.scenario_id is never null, so
-- it never takes that branch, but needs no special-casing either --
-- the same two-null-checks-then-compare logic is correct for both.
create function assert_same_scenario(
  p_subject_scenario_id uuid,
  p_referenced_scenario_id uuid,
  p_subject_label text,
  p_referenced_label text
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject_name text;
  v_referenced_name text;
begin
  if p_subject_scenario_id is null or p_referenced_scenario_id is null then
    return;
  end if;
  if p_subject_scenario_id = p_referenced_scenario_id then
    return;
  end if;

  select name into v_subject_name from scenarios where id = p_subject_scenario_id;
  select name into v_referenced_name from scenarios where id = p_referenced_scenario_id;

  raise exception
    '% belongs to scenario "%", but % belongs to scenario "%" -- they must be in the same scenario.',
    p_subject_label, v_subject_name, p_referenced_label, v_referenced_name;
end;
$$;

-- Not a trigger function -- it's called *from* one (`perform
-- assert_same_scenario(...)`), and that call runs under the calling
-- role (every caller here is `security invoker`), so unlike a trigger
-- function itself -- invoked directly by the trigger manager, which
-- never checks EXECUTE -- this one needs EXECUTE granted the normal
-- way, same as any other callable function.
revoke execute on function assert_same_scenario(uuid, uuid, text, text) from public, anon;
grant execute on function assert_same_scenario(uuid, uuid, text, text) to authenticated;

-- Restated: same signature, same trigger, now delegating to the
-- shared check above instead of its own inline comparison.
create or replace function enforce_payment_scenario_consistency()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_budget_line_scenario_id uuid;
begin
  select scenario_id into v_budget_line_scenario_id from budget_lines where id = new.budget_line_id;
  perform assert_same_scenario(new.scenario_id, v_budget_line_scenario_id, 'This payment', 'its budget line');
  return new;
end;
$$;

revoke execute on function enforce_payment_scenario_consistency() from public, anon, authenticated;

-- stays.scenario_id and movements.scenario_id are never null (not
-- null since 20261023090000), so the "subject" side of every call
-- below is always present; only the referenced row's side can be
-- null, and only for a budget line.
create function trg_stays_validate_scenario_fn()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_budget_line_scenario_id uuid;
  v_flight_option_scenario_id uuid;
begin
  if new.budget_line_id is not null then
    select scenario_id into v_budget_line_scenario_id from budget_lines where id = new.budget_line_id;
    perform assert_same_scenario(new.scenario_id, v_budget_line_scenario_id, 'This stay', 'its budget line');
  end if;

  if new.flight_option_id is not null then
    select scenario_id into v_flight_option_scenario_id from flight_options where id = new.flight_option_id;
    perform assert_same_scenario(new.scenario_id, v_flight_option_scenario_id, 'This stay', 'its flight option');
  end if;

  return new;
end;
$$;

create trigger trg_stays_validate_scenario
before insert or update on stays
for each row execute function trg_stays_validate_scenario_fn();

create function trg_movements_validate_scenario_fn()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_budget_line_scenario_id uuid;
  v_flight_option_scenario_id uuid;
begin
  if new.budget_line_id is not null then
    select scenario_id into v_budget_line_scenario_id from budget_lines where id = new.budget_line_id;
    perform assert_same_scenario(new.scenario_id, v_budget_line_scenario_id, 'This movement', 'its budget line');
  end if;

  if new.flight_option_id is not null then
    select scenario_id into v_flight_option_scenario_id from flight_options where id = new.flight_option_id;
    perform assert_same_scenario(new.scenario_id, v_flight_option_scenario_id, 'This movement', 'its flight option');
  end if;

  return new;
end;
$$;

create trigger trg_movements_validate_scenario
before insert or update on movements
for each row execute function trg_movements_validate_scenario_fn();
