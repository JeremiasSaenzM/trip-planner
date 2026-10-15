-- Creating a budget line, a source, or an FX rate stays a plain insert
-- from the app (nothing existed before to justify changing, so
-- change_log's trigger doesn't require a reason) -- only edits and
-- deletes get an RPC here, same pattern as savings_entries_writes.sql.

-- update_budget_line always clears auto_created: editing a line through
-- this form is exactly what makes it "proper" (see create_payment's own
-- auto_created line, which is never confirmed and has no source).
create or replace function update_budget_line(
  p_id uuid,
  p_category budget_category,
  p_description text,
  p_amount_min numeric,
  p_amount_target numeric,
  p_amount_conservative numeric,
  p_currency text,
  p_information_state info_state,
  p_source_id uuid,
  p_notes text,
  p_reason text
)
returns budget_lines
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row budget_lines;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update budget_lines
  set category = p_category,
      description = p_description,
      amount_min = p_amount_min,
      amount_target = p_amount_target,
      amount_conservative = p_amount_conservative,
      currency = p_currency,
      information_state = p_information_state,
      source_id = p_source_id,
      notes = p_notes,
      auto_created = false
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Budget line % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_budget_line(
  uuid, budget_category, text, numeric, numeric, numeric, text, info_state, uuid, text, text
) from public, anon;
grant execute on function update_budget_line(
  uuid, budget_category, text, numeric, numeric, numeric, text, info_state, uuid, text, text
) to authenticated;

-- payments.budget_line_id is "on delete cascade" -- deleting a line that
-- still has payments attached would silently delete their history too.
-- Refusing it here means the person has to delete or reassign those
-- payments first, so a budget line never disappears a payment as a
-- side effect of something else.
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

  delete from budget_lines where id = p_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Budget line % not found (or not yours)', p_id;
  end if;
end;
$$;

revoke execute on function delete_budget_line(uuid, text) from public, anon;
grant execute on function delete_budget_line(uuid, text) to authenticated;

create or replace function update_fx_rate(
  p_id uuid,
  p_currency text,
  p_rate_to_usd numeric,
  p_rate_date date,
  p_rate_kind rate_kind,
  p_information_state info_state,
  p_source_id uuid,
  p_reason text
)
returns fx_rates
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row fx_rates;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update fx_rates
  set currency = p_currency,
      rate_to_usd = p_rate_to_usd,
      rate_date = p_rate_date,
      rate_kind = p_rate_kind,
      information_state = p_information_state,
      source_id = p_source_id
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'FX rate % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_fx_rate(
  uuid, text, numeric, date, rate_kind, info_state, uuid, text
) from public, anon;
grant execute on function update_fx_rate(
  uuid, text, numeric, date, rate_kind, info_state, uuid, text
) to authenticated;
