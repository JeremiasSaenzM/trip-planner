-- Append-only audit trail. Every tracked table gets a trigger below that
-- writes one row here on every insert/update/delete, with a full
-- before/after snapshot so "what changed" can always be diffed later.
create table change_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  action change_action not null,
  old_data jsonb,
  new_data jsonb,
  reason text,
  actor text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  constraint change_log_actor_values check (actor in ('app', 'seed', 'claude'))
);

alter table change_log enable row level security;

-- Read-only for the owner. There is deliberately no insert/update/delete
-- policy for anyone -- not even the owner -- because this log must be
-- append-only and the only way a row should ever land here is through
-- the trigger below.
create policy "owner_read" on change_log
  for select
  using (owner_id = auth.uid());

-- security definer + a pinned search_path: this function has to insert
-- into change_log even though no role has an insert grant there, and a
-- function with elevated privilege must never resolve unqualified names
-- against a search_path an attacker could influence.
create or replace function change_log_capture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text;
  v_actor text;
  v_row_id uuid;
  v_owner_id uuid;
begin
  v_reason := nullif(current_setting('app.change_reason', true), '');
  v_actor := coalesce(nullif(current_setting('app.actor', true), ''), 'app');

  -- Inserts may go unexplained (nothing existed before, so there's
  -- nothing to justify changing). Updates and deletes touch a value
  -- that already meant something, so -- outside of seed data -- they
  -- must say why. Phase 6 writes (the Claude bridge) skip the edit UI
  -- entirely, so this has to be enforced here, not in a form.
  if tg_op in ('UPDATE', 'DELETE') and v_actor <> 'seed' and v_reason is null then
    raise exception
      'A reason is required for % on %.% (set app.change_reason before writing)',
      tg_op, tg_table_schema, tg_table_name;
  end if;

  if tg_op = 'DELETE' then
    v_row_id := old.id;
    v_owner_id := old.owner_id;
  else
    v_row_id := new.id;
    v_owner_id := new.owner_id;
  end if;

  insert into change_log (
    owner_id, table_name, row_id, action, old_data, new_data, reason, actor, changed_by
  )
  values (
    v_owner_id,
    tg_table_name,
    v_row_id,
    lower(tg_op)::change_action,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    v_reason,
    v_actor,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function change_log_capture() from public, anon, authenticated;

create trigger trg_trips_audit after insert or update or delete on trips
  for each row execute function change_log_capture();
create trigger trg_sources_audit after insert or update or delete on sources
  for each row execute function change_log_capture();
create trigger trg_competitions_audit after insert or update or delete on competitions
  for each row execute function change_log_capture();
create trigger trg_scenarios_audit after insert or update or delete on scenarios
  for each row execute function change_log_capture();
create trigger trg_decisions_audit after insert or update or delete on decisions
  for each row execute function change_log_capture();
create trigger trg_budget_lines_audit after insert or update or delete on budget_lines
  for each row execute function change_log_capture();
create trigger trg_payments_audit after insert or update or delete on payments
  for each row execute function change_log_capture();
create trigger trg_savings_entries_audit after insert or update or delete on savings_entries
  for each row execute function change_log_capture();
create trigger trg_fx_rates_audit after insert or update or delete on fx_rates
  for each row execute function change_log_capture();
create trigger trg_open_items_audit after insert or update or delete on open_items
  for each row execute function change_log_capture();
create trigger trg_flight_options_audit after insert or update or delete on flight_options
  for each row execute function change_log_capture();
create trigger trg_flight_segments_audit after insert or update or delete on flight_segments
  for each row execute function change_log_capture();
