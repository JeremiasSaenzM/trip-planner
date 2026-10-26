-- delete_scenario_cascade's approved-proposal-item blocker
-- (20261026090000) was a mistake: a proposal_items row is an audit
-- record -- it keeps its payload, reason, status and decision date
-- regardless of whether the row it wrote to still exists, the same way
-- change_log does. Refusing a delete because an import once touched
-- the scenario made a plan entered by hand deletable and the same plan
-- entered by research permanent, and left no way to ever clear an
-- abandoned scenario that an import had reached. Removing the block;
-- the dangling reference is handled by the review screen instead (see
-- resultStillExists in src/lib/proposals/review.ts), not left to
-- silently show a broken link.
--
-- result_id has no foreign key of its own (it's polymorphic across
-- several tables), so leaving it pointing at a row that's gone is not
-- a constraint violation -- nothing here needs to change to allow it.
create or replace function delete_scenario_cascade(p_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_scenario scenarios;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  select * into v_scenario from scenarios where id = p_id;
  if v_scenario.id is null then
    raise exception 'Scenario % not found (or not yours)', p_id;
  end if;

  perform set_config('app.change_reason', p_reason, true);

  -- A decision is a record that I decided something -- accepted_amount/
  -- accepted_currency (20261015090000) exist precisely so it means the
  -- same thing independent of the live link. Deleting the decision
  -- would destroy a record of my own judgement because a scenario it
  -- referred to went away; refusing the whole delete over it would make
  -- a scenario permanently undeletable just because a risk was once
  -- accepted in it. Neither is right -- the decision stays, only the
  -- live pointer clears, and (app.change_reason already set above)
  -- carries this cascade's own reason into change_log, so a decision
  -- with a null payment_id can be told apart from one that never had
  -- a payment at all.
  update decisions set payment_id = null
  where payment_id in (
    select id from payments
    where scenario_id = p_id
       or budget_line_id in (select id from budget_lines where scenario_id = p_id)
  );

  -- Before budget_lines: stays/movements.budget_line_id has no cascade
  -- of its own, so deleting a budget line a surviving stay or movement
  -- still points at would fail on that foreign key.
  delete from stays where scenario_id = p_id;
  delete from movements where scenario_id = p_id;

  -- Before budget_lines too, so a payment on a *shared* budget line
  -- (scenario_id null on the line, but this scenario_id on the
  -- payment) is caught here rather than surviving the line it's priced
  -- against staying put.
  delete from payments where scenario_id = p_id;

  -- Cascades flight_segments.
  delete from flight_options where scenario_id = p_id;

  -- Cascades any payment still attached that was reached only through
  -- budget_line_id (scenario_id null on the payment, the line's own
  -- scenario_id set to this scenario) -- not caught by the explicit
  -- payments delete above.
  delete from budget_lines where scenario_id = p_id;

  delete from scenarios where id = p_id;
end;
$$;

revoke execute on function delete_scenario_cascade(uuid, text) from public, anon;
grant execute on function delete_scenario_cascade(uuid, text) to authenticated;
