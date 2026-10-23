-- Removing a scenario with real content in it meant deleting every
-- budget line, payment, stay and movement by hand first -- roughly 27
-- separate deletions, each with its own typed reason, for a scenario
-- the size the import path now creates in one paste. This adds the
-- missing deliberate cascade: delete a scenario and everything in it
-- in one operation, with its own confirmation and its own guard.
--
-- delete_scenario (20261019090000) stays exactly as it is -- the
-- default, still refusing while anything references the scenario.
-- This is a separate, explicitly more dangerous action, not that
-- button quietly growing teeth.

-- delete_scenario's own guard never learned about stays and movements
-- when Phase 6.4 added them (unlike delete_budget_line's guard, which
-- did) -- so today, a scenario with no budget lines/payments/flight
-- options but real stays or movements is silently cascade-deleted by
-- the plain Delete button, via stays/movements.scenario_id's own "on
-- delete cascade". Closing that gap here, alongside the new operation
-- it's the direct precedent for.
create or replace function delete_scenario(p_id uuid, p_reason text)
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

  if exists (select 1 from stays where scenario_id = p_id) then
    raise exception 'Scenario % still has stays -- delete them first.', p_id;
  end if;

  if exists (select 1 from movements where scenario_id = p_id) then
    raise exception 'Scenario % still has movements -- delete them first.', p_id;
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

-- Deletes a scenario and everything that belongs only to it: its own
-- budget lines, their payments, any payment carrying this scenario_id
-- directly (a shared, trip-wide budget line can still have a
-- scenario-specific payment against it -- that payment has to go too,
-- even though its budget line survives), its stays, its movements and
-- its flight options. Every delete below is a bulk "delete ... where",
-- not a loop -- change_log's triggers are "for each row", so one entry
-- per destroyed row falls out on its own, with nothing summarizing the
-- scenario as a single change.
create function delete_scenario_cascade(p_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_scenario scenarios;
  v_blockers text;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  select * into v_scenario from scenarios where id = p_id;
  if v_scenario.id is null then
    raise exception 'Scenario % not found (or not yours)', p_id;
  end if;

  -- Approved proposal items can't be removed (approve_proposal's own
  -- write already happened, and a later {"item": n} reference may
  -- still resolve through them) -- result_id has no foreign key of its
  -- own, so without this check the first offending row would fail on
  -- a bare constraint violation instead of naming which item and why.
  select string_agg(
    format('item %s (%s) in batch "%s"', pi.position + 1, pi.op, coalesce(pb.note, pb.id::text)),
    '; ' order by pi.position
  )
  into v_blockers
  from proposal_items pi
  join proposal_batches pb on pb.id = pi.batch_id
  where pi.status = 'approved'
    and pi.result_id in (
      select p_id
      union select id from budget_lines where scenario_id = p_id
      union select id from payments
        where scenario_id = p_id
           or budget_line_id in (select id from budget_lines where scenario_id = p_id)
      union select id from stays where scenario_id = p_id
      union select id from movements where scenario_id = p_id
    );

  if v_blockers is not null then
    raise exception 'Can''t delete: approved proposal items still reference this scenario -- %.', v_blockers;
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
