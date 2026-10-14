-- Guards the app-layer Zod schema already enforces, repeated here so
-- they hold even for a write that skips the form (direct SQL, a future
-- Phase 6 Claude/MCP write). "Not in the future" compares in UTC
-- explicitly, not current_date, since current_date follows the
-- session's timezone GUC -- see src/lib/validation/shared.ts's
-- todayUtc() for the same rule on the app side.
alter table savings_entries
  add constraint savings_entries_amount_positive check (amount > 0),
  add constraint savings_entries_recorded_on_not_future
    check (recorded_on <= (now() at time zone 'utc')::date);

-- Recording a new entry stays a plain insert from the app (nothing
-- existed before to justify changing, so change_log's trigger doesn't
-- require a reason for it). Only edits and deletes need a reason, so
-- only they get an RPC -- its job is setting app.change_reason in the
-- same call the trigger checks it in.
--
-- security invoker: runs with the caller's own privileges, so the
-- existing owner_all RLS policy on savings_entries is what actually
-- restricts "where id = p_id" to the caller's own rows -- someone
-- else's id just matches zero rows. A pinned search_path keeps
-- unqualified names (savings_entries, change_log) from ever resolving
-- against a schema an attacker could put ahead of it.
create or replace function update_savings_entry(
  p_id uuid,
  p_amount numeric,
  p_recorded_on date,
  p_note text,
  p_reason text
)
returns savings_entries
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row savings_entries;
begin
  -- Checked here, not left to change_log's trigger alone: that trigger
  -- is the backstop for every table, but this RPC is specifically the
  -- one place a reason is supposed to be required, so it fails on its
  -- own terms rather than relying on a different layer's check.
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update savings_entries
  set amount = p_amount,
      recorded_on = p_recorded_on,
      note = p_note
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Savings entry % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_savings_entry(uuid, numeric, date, text, text) from public, anon;
grant execute on function update_savings_entry(uuid, numeric, date, text, text) to authenticated;

create or replace function delete_savings_entry(
  p_id uuid,
  p_reason text
)
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

  delete from savings_entries where id = p_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Savings entry % not found (or not yours)', p_id;
  end if;
end;
$$;

revoke execute on function delete_savings_entry(uuid, text) from public, anon;
grant execute on function delete_savings_entry(uuid, text) to authenticated;
