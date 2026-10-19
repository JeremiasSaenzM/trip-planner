-- How well-founded a budget line's number is, from the planning
-- system's own scale (07 §8):
--   high   -- confirmed price or purchase
--   medium -- several current observations, or strong history
--   low    -- mostly estimates
-- Separate from info_state, which says what *kind* of claim a value is
-- (confirmed, estimate, assumption, ...); this says how solid it is.
create type confidence_level as enum ('low', 'medium', 'high');

-- Nullable, no default: a line may simply not have been assessed yet,
-- and "not assessed" must never read as a silent "low". Existing rows
-- (including create_payment's auto-created lines) start as null.
alter table budget_lines add column confidence confidence_level;

-- update_budget_line gains p_confidence, handled like every other field
-- (same reason requirement, captured by change_log's trigger via the
-- whole-row old_data/new_data). Adding a parameter changes the
-- function's signature, so the old 11-argument version has to be
-- dropped -- `create or replace` alone would leave both overloads in
-- place, and the old one would keep accepting edits that silently
-- skip confidence.
drop function update_budget_line(
  uuid, budget_category, text, numeric, numeric, numeric, text, info_state, uuid, text, text
);

-- update_budget_line always clears auto_created: editing a line through
-- this form is exactly what makes it "proper" (see create_payment's own
-- auto_created line, which is never confirmed and has no source).
create function update_budget_line(
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
  p_confidence confidence_level,
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
      confidence = p_confidence,
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
  uuid, budget_category, text, numeric, numeric, numeric, text, info_state, uuid, text, confidence_level, text
) from public, anon;
grant execute on function update_budget_line(
  uuid, budget_category, text, numeric, numeric, numeric, text, info_state, uuid, text, confidence_level, text
) to authenticated;
