-- Import proposals: research results pasted in as one block, reviewed
-- item by item, and written only when approved.
--
-- A proposal is not a back door. Approving one runs the same writes a
-- form would -- the existing update RPCs, create_payment, or the same
-- plain insert the app does for the other creates -- so every
-- constraint, trigger, RLS policy and the acceptance safeguard applies
-- exactly as it does to manual entry, and change_log records the write
-- with the proposal's own reason and actor 'claude'.

-- 1. change_log: a Claude-originated write always carries a reason.
--
-- Inserts are otherwise exempt (nothing existed before, so there's
-- nothing to justify changing), and 'seed' is exempt from the rule for
-- updates and deletes. Neither exemption applies to 'claude': whatever
-- Claude proposed, the log has to say why, insert or not. Everything
-- else in this function is unchanged from 20261012131400_change_log.sql.
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

  if v_actor = 'claude' and v_reason is null then
    raise exception
      'A reason is required for every Claude-originated write (% on %.%)',
      tg_op, tg_table_schema, tg_table_name;
  end if;

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

-- 2. The tables.

-- Exactly the operations v1 supports. Anything else in a paste is
-- refused by the app's schema before it gets here, and a value outside
-- this enum can't be stored at all.
create type proposal_op as enum (
  'create_source',
  'create_competition',
  'create_scenario',
  'create_budget_line',
  'create_payment',
  'create_fx_rate',
  'update_competition',
  'update_scenario',
  'update_budget_line',
  'update_payment',
  'update_fx_rate',
  'update_savings_entry'
);

create type proposal_status as enum ('pending', 'approved', 'rejected');

-- One paste. raw_text is kept as it was pasted, for the audit trail --
-- what was actually proposed, not only what the app made of it.
create table proposal_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  trip_id uuid not null references trips (id),
  note text,
  raw_text text not null,
  created_at timestamptz not null default now(),
  constraint proposal_batches_raw_text_size check (octet_length(raw_text) <= 200000),
  constraint proposal_batches_note_length check (note is null or char_length(note) <= 500)
);

-- One proposed change. payload is the validated item in the app's own
-- field names: {"data": {...}} for a create, {"changes": {"field":
-- {"from": ..., "to": ...}}} for an update. A reference to another item
-- of the same batch is stored as {"item": <position>}, and depends_on
-- lists those positions, so an item can't be approved before what it
-- points to.
create table proposal_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  batch_id uuid not null references proposal_batches (id),
  position integer not null,
  ref text,
  op proposal_op not null,
  target_id uuid,
  payload jsonb not null,
  depends_on integer[] not null default '{}',
  reason text not null,
  status proposal_status not null default 'pending',
  decision_reason text,
  decided_at timestamptz,
  -- The row the approval created (or, for an update, the row it
  -- changed) -- what a later item's {"item": n} resolves to.
  result_id uuid,
  created_at timestamptz not null default now(),
  constraint proposal_items_position_unique unique (batch_id, position),
  constraint proposal_items_position_nonnegative check (position >= 0),
  constraint proposal_items_reason_required check (trim(reason) <> ''),
  constraint proposal_items_update_needs_target check ((op::text like 'update_%') = (target_id is not null)),
  constraint proposal_items_rejection_needs_reason check (
    status <> 'rejected' or trim(coalesce(decision_reason, '')) <> ''
  ),
  constraint proposal_items_decided_at_matches_status check ((status = 'pending') = (decided_at is null)),
  constraint proposal_items_result_matches_status check ((status = 'approved') = (result_id is not null))
);

create index proposal_items_batch_id_idx on proposal_items (batch_id);

alter table proposal_batches enable row level security;
alter table proposal_items enable row level security;

create policy "owner_all" on proposal_batches
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner_all" on proposal_items
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Grants, stated here per CLAUDE.md. No delete for anyone: a proposal is
-- approved or rejected, never discarded. A batch is never edited after
-- it's pasted, so it has no update either.
revoke all on table proposal_batches, proposal_items from anon, authenticated, service_role;
grant select, insert on table proposal_batches to authenticated, service_role;
grant select, insert, update on table proposal_items to authenticated, service_role;

create trigger trg_proposal_batches_audit after insert or update or delete on proposal_batches
  for each row execute function change_log_capture();
create trigger trg_proposal_items_audit after insert or update or delete on proposal_items
  for each row execute function change_log_capture();

-- A proposal is born pending, can be decided exactly once, and is never
-- edited: what was proposed stays what was proposed. Approval is only
-- possible inside approve_proposal(), which sets app.approving_proposal
-- to the item's own id for the one update that marks it -- a direct
-- update to 'approved' would claim a write that never happened.
create or replace function enforce_proposal_item_rules()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.decided_at is not null or new.result_id is not null then
      raise exception 'A new proposal must start pending.';
    end if;
    if not exists (select 1 from proposal_batches where id = new.batch_id) then
      raise exception 'Proposal batch % not found (or not yours)', new.batch_id;
    end if;
    return new;
  end if;

  if old.status <> 'pending' then
    raise exception 'Proposal % was already %.', old.id, old.status;
  end if;

  if (new.owner_id, new.batch_id, new.position, new.ref, new.op, new.target_id, new.payload, new.depends_on, new.reason)
     is distinct from
     (old.owner_id, old.batch_id, old.position, old.ref, old.op, old.target_id, old.payload, old.depends_on, old.reason)
  then
    raise exception 'A proposal can''t be edited -- reject it and paste a corrected one.';
  end if;

  if new.status = 'approved'
     and current_setting('app.approving_proposal', true) is distinct from new.id::text then
    raise exception 'A proposal can only be approved through approve_proposal().';
  end if;

  return new;
end;
$$;

revoke execute on function enforce_proposal_item_rules() from public, anon, authenticated;

create trigger trg_proposal_items_rules before insert or update on proposal_items
  for each row execute function enforce_proposal_item_rules();

-- 3. Saving a pasted batch.
--
-- p_items is the app's already-validated list: [{position, ref, op,
-- targetId, payload, dependsOn, reason}, ...]. This still re-checks what
-- the database alone can see -- that every update's target exists and
-- is yours, in this trip -- and the shape rules the app relies on, so a
-- direct call can't store something the review screen would misread.
create or replace function create_proposal_batch(
  p_trip_id uuid,
  p_note text,
  p_raw_text text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_item jsonb;
  v_index bigint;
  v_op proposal_op;
  v_target uuid;
  v_depends integer[];
  v_found boolean;
begin
  if not exists (select 1 from trips where id = p_trip_id) then
    raise exception 'Trip % not found (or not yours)', p_trip_id;
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A proposal batch needs at least one item.';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A proposal batch can hold at most 200 items.';
  end if;

  insert into proposal_batches (trip_id, note, raw_text)
  values (p_trip_id, nullif(trim(coalesce(p_note, '')), ''), p_raw_text)
  returning id into v_batch_id;

  for v_item, v_index in
    select value, ordinality - 1 from jsonb_array_elements(p_items) with ordinality
  loop
    if (v_item ->> 'position')::integer is distinct from v_index::integer then
      raise exception 'Proposal items must be numbered in order (item % says %).', v_index, v_item ->> 'position';
    end if;

    v_op := (v_item ->> 'op')::proposal_op;
    v_target := (v_item ->> 'targetId')::uuid;
    v_depends := coalesce(
      (select array_agg(value::integer) from jsonb_array_elements_text(coalesce(v_item -> 'dependsOn', '[]'::jsonb))),
      '{}'
    );

    if exists (select 1 from unnest(v_depends) d where d < 0 or d >= v_index) then
      raise exception 'Item % can only depend on items before it.', v_index + 1;
    end if;

    if v_op::text like 'update_%' then
      v_found := case v_op
        when 'update_competition' then
          exists (select 1 from competitions where id = v_target and trip_id = p_trip_id)
        when 'update_scenario' then
          exists (select 1 from scenarios where id = v_target and trip_id = p_trip_id)
        when 'update_budget_line' then
          exists (select 1 from budget_lines where id = v_target and trip_id = p_trip_id)
        when 'update_payment' then
          exists (
            select 1 from payments p join budget_lines bl on bl.id = p.budget_line_id
            where p.id = v_target and bl.trip_id = p_trip_id
          )
        when 'update_fx_rate' then
          exists (select 1 from fx_rates where id = v_target)
        when 'update_savings_entry' then
          exists (select 1 from savings_entries where id = v_target and trip_id = p_trip_id)
      end;
      if not v_found then
        raise exception 'Item %: the row it updates was not found (or not yours)', v_index + 1;
      end if;
    end if;

    insert into proposal_items (batch_id, position, ref, op, target_id, payload, depends_on, reason)
    values (
      v_batch_id,
      v_index,
      v_item ->> 'ref',
      v_op,
      v_target,
      v_item -> 'payload',
      v_depends,
      v_item ->> 'reason'
    );
  end loop;

  return v_batch_id;
end;
$$;

revoke execute on function create_proposal_batch(uuid, text, text, jsonb) from public, anon;
grant execute on function create_proposal_batch(uuid, text, text, jsonb) to authenticated;

-- 4. Approving.

-- Resolves one reference from a payload: {"id": "<uuid>"} for a row you
-- already have, {"item": n} for an item of the same batch (which must
-- be an approved create of the right kind), or null. Either way the row
-- has to be visible to you -- RLS -- and in this trip, so a reference
-- can never reach someone else's data, or another trip's.
create or replace function proposal_ref(p_batch_id uuid, p_trip_id uuid, p_ref jsonb, p_kind text)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_found boolean;
begin
  if p_ref is null or jsonb_typeof(p_ref) = 'null' then
    return null;
  end if;

  if p_ref ? 'item' then
    select result_id into v_id
    from proposal_items
    where batch_id = p_batch_id
      and position = (p_ref ->> 'item')::integer
      and op = ('create_' || p_kind)::proposal_op
      and status = 'approved';
    if v_id is null then
      raise exception 'Proposal depends on item % of this batch, which isn''t an approved %.',
        (p_ref ->> 'item')::integer + 1, replace(p_kind, '_', ' ');
    end if;
  elsif p_ref ? 'id' then
    v_id := (p_ref ->> 'id')::uuid;
  else
    raise exception 'Malformed reference in proposal: %', p_ref;
  end if;

  v_found := case p_kind
    when 'source' then exists (select 1 from sources where id = v_id)
    when 'competition' then exists (select 1 from competitions where id = v_id and trip_id = p_trip_id)
    when 'scenario' then exists (select 1 from scenarios where id = v_id and trip_id = p_trip_id)
    when 'budget_line' then exists (select 1 from budget_lines where id = v_id and trip_id = p_trip_id)
    else false
  end;
  if not v_found then
    raise exception '% % not found (or not yours)', initcap(replace(p_kind, '_', ' ')), v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function proposal_ref(uuid, uuid, jsonb, text) from public, anon;
grant execute on function proposal_ref(uuid, uuid, jsonb, text) to authenticated;

-- An update's changes, applied to the target's current values.
--
-- p_current is the row as it is right now, under the caller's row lock,
-- in the same field names the payload uses. Every field the proposal
-- touches must be one of those (anything else is refused, never
-- ignored), and its "from" must still match: if the value moved since
-- the proposal was written, the approval fails -- it never overwrites
-- a change made in the meantime. Reference fields (p_ref_kinds maps
-- field -> kind) are resolved through proposal_ref().
create or replace function proposal_merge_changes(
  p_item proposal_items,
  p_trip_id uuid,
  p_current jsonb,
  p_ref_kinds jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_field text;
  v_change jsonb;
  v_to jsonb;
  v_merged jsonb := p_current;
begin
  for v_field, v_change in select key, value from jsonb_each(coalesce(p_item.payload -> 'changes', '{}'::jsonb)) loop
    if not (p_current ? v_field) then
      raise exception 'Proposal changes a field it can''t: %', v_field;
    end if;

    if (p_current -> v_field) is distinct from (v_change -> 'from') then
      raise exception 'Proposal is out of date: % is now %, but the proposal expected %.',
        v_field, p_current -> v_field, v_change -> 'from';
    end if;

    if p_ref_kinds ? v_field then
      v_to := coalesce(
        to_jsonb(proposal_ref(p_item.batch_id, p_trip_id, v_change -> 'to', p_ref_kinds ->> v_field)),
        'null'::jsonb
      );
    else
      v_to := coalesce(v_change -> 'to', 'null'::jsonb);
    end if;

    v_merged := v_merged || jsonb_build_object(v_field, v_to);
  end loop;

  return v_merged;
end;
$$;

revoke execute on function proposal_merge_changes(proposal_items, uuid, jsonb, jsonb) from public, anon;
grant execute on function proposal_merge_changes(proposal_items, uuid, jsonb, jsonb) to authenticated;

-- Approves one item, in one transaction: the write and "approved" land
-- together or not at all, so a failure can never leave a change applied
-- but still pending (and a retry can't apply it twice).
--
-- The write runs with app.actor = 'claude' and the proposal's own
-- reason; changed_by still records you, the person who approved it.
create or replace function approve_proposal(p_item_id uuid)
returns proposal_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item proposal_items;
  v_trip_id uuid;
  v_data jsonb;
  v_current jsonb;
  v_new jsonb;
  v_result uuid;
  v_competition competitions;
  v_scenario scenarios;
  v_line budget_lines;
  v_payment payments;
  v_rate fx_rates;
  v_entry savings_entries;
begin
  select * into v_item from proposal_items where id = p_item_id for update;
  if v_item.id is null then
    raise exception 'Proposal % not found (or not yours)', p_item_id;
  end if;
  if v_item.status <> 'pending' then
    raise exception 'Proposal % was already %.', p_item_id, v_item.status;
  end if;

  select trip_id into v_trip_id from proposal_batches where id = v_item.batch_id;
  if v_trip_id is null then
    raise exception 'Proposal batch % not found (or not yours)', v_item.batch_id;
  end if;

  if exists (
    select 1 from proposal_items d
    where d.batch_id = v_item.batch_id and d.position = any (v_item.depends_on) and d.status <> 'approved'
  ) then
    raise exception 'Proposal depends on an item of this batch that isn''t approved yet.';
  end if;

  perform set_config('app.change_reason', v_item.reason, true);
  perform set_config('app.actor', 'claude', true);

  v_data := v_item.payload -> 'data';

  case v_item.op
    when 'create_source' then
      insert into sources (provider, tier, url, observed_on, applicable_period, notes)
      values (
        v_data ->> 'provider',
        (v_data ->> 'tier')::smallint,
        v_data ->> 'url',
        (v_data ->> 'observedOn')::date,
        case
          when v_data ->> 'applicablePeriodStart' is null and v_data ->> 'applicablePeriodEnd' is null then null
          else daterange((v_data ->> 'applicablePeriodStart')::date, (v_data ->> 'applicablePeriodEnd')::date, '[)')
        end,
        v_data ->> 'notes'
      )
      returning id into v_result;

    when 'create_competition' then
      insert into competitions (
        trip_id, name, city, country, venue, start_date, end_date, timezone, dates_state, dates_source_id
      ) values (
        v_trip_id,
        v_data ->> 'name',
        v_data ->> 'city',
        v_data ->> 'country',
        v_data ->> 'venue',
        (v_data ->> 'startDate')::date,
        (v_data ->> 'endDate')::date,
        v_data ->> 'timezone',
        coalesce(v_data ->> 'datesState', 'pending')::info_state,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'datesSource', 'source')
      )
      returning id into v_result;

    when 'create_scenario' then
      insert into scenarios (trip_id, name, competition_id, includes_extension, notes)
      values (
        v_trip_id,
        v_data ->> 'name',
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'competition', 'competition'),
        coalesce((v_data ->> 'includesExtension')::boolean, false),
        v_data ->> 'notes'
      )
      returning id into v_result;

    when 'create_budget_line' then
      insert into budget_lines (
        trip_id, scenario_id, category, description,
        amount_min, amount_target, amount_conservative, currency,
        information_state, source_id, notes, confidence
      ) values (
        v_trip_id,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'scenario', 'scenario'),
        (v_data ->> 'category')::budget_category,
        v_data ->> 'description',
        (v_data ->> 'amountMin')::numeric,
        (v_data ->> 'amountTarget')::numeric,
        (v_data ->> 'amountConservative')::numeric,
        v_data ->> 'currency',
        (v_data ->> 'informationState')::info_state,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'source', 'source'),
        v_data ->> 'notes',
        (v_data ->> 'confidence')::confidence_level
      )
      returning id into v_result;

    when 'create_payment' then
      select (create_payment(
        v_trip_id,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'scenario', 'scenario'),
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'budgetLine', 'budget_line'),
        (v_data ->> 'category')::budget_category,
        v_data ->> 'description',
        v_data ->> 'currency',
        (v_data ->> 'totalAmount')::numeric,
        (v_data ->> 'refundability')::refundability,
        (v_data ->> 'cancellationDeadline')::date,
        (v_data ->> 'timingType')::payment_timing,
        (v_data ->> 'dueDate')::date,
        (v_data ->> 'competitionRelated')::boolean
      )).id into v_result;

    when 'create_fx_rate' then
      insert into fx_rates (currency, rate_to_usd, rate_date, rate_kind, information_state, source_id)
      values (
        v_data ->> 'currency',
        (v_data ->> 'rateToUsd')::numeric,
        (v_data ->> 'rateDate')::date,
        (v_data ->> 'rateKind')::rate_kind,
        (v_data ->> 'informationState')::info_state,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'source', 'source')
      )
      returning id into v_result;

    when 'update_competition' then
      select * into v_competition from competitions
      where id = v_item.target_id and trip_id = v_trip_id for update;
      if v_competition.id is null then
        raise exception 'Competition % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'name', v_competition.name,
        'city', v_competition.city,
        'country', v_competition.country,
        'venue', v_competition.venue,
        'startDate', v_competition.start_date,
        'endDate', v_competition.end_date,
        'timezone', v_competition.timezone,
        'datesState', v_competition.dates_state,
        'datesSource', v_competition.dates_source_id
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"datesSource": "source"}');
      perform update_competition(
        v_item.target_id,
        v_new ->> 'name',
        v_new ->> 'city',
        v_new ->> 'country',
        v_new ->> 'venue',
        (v_new ->> 'startDate')::date,
        (v_new ->> 'endDate')::date,
        v_new ->> 'timezone',
        (v_new ->> 'datesState')::info_state,
        (v_new ->> 'datesSource')::uuid,
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_scenario' then
      select * into v_scenario from scenarios
      where id = v_item.target_id and trip_id = v_trip_id for update;
      if v_scenario.id is null then
        raise exception 'Scenario % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object('name', v_scenario.name, 'competition', v_scenario.competition_id);
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"competition": "competition"}');
      perform update_scenario(
        v_item.target_id,
        v_new ->> 'name',
        (v_new ->> 'competition')::uuid,
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_budget_line' then
      select * into v_line from budget_lines
      where id = v_item.target_id and trip_id = v_trip_id for update;
      if v_line.id is null then
        raise exception 'Budget line % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'category', v_line.category,
        'description', v_line.description,
        'amountMin', v_line.amount_min,
        'amountTarget', v_line.amount_target,
        'amountConservative', v_line.amount_conservative,
        'currency', v_line.currency,
        'informationState', v_line.information_state,
        'source', v_line.source_id,
        'notes', v_line.notes,
        'confidence', v_line.confidence
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"source": "source"}');
      perform update_budget_line(
        v_item.target_id,
        (v_new ->> 'category')::budget_category,
        v_new ->> 'description',
        (v_new ->> 'amountMin')::numeric,
        (v_new ->> 'amountTarget')::numeric,
        (v_new ->> 'amountConservative')::numeric,
        v_new ->> 'currency',
        (v_new ->> 'informationState')::info_state,
        (v_new ->> 'source')::uuid,
        v_new ->> 'notes',
        (v_new ->> 'confidence')::confidence_level,
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_payment' then
      select p.* into v_payment
      from payments p join budget_lines bl on bl.id = p.budget_line_id
      where p.id = v_item.target_id and bl.trip_id = v_trip_id
      for update of p;
      if v_payment.id is null then
        raise exception 'Payment % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'description', v_payment.description,
        'totalAmount', v_payment.total_amount,
        'currency', v_payment.currency,
        'dueDate', v_payment.due_date,
        'cancellationDeadline', v_payment.cancellation_deadline,
        'datesState', v_payment.dates_state,
        'datesSource', v_payment.dates_source_id,
        'timingType', v_payment.timing_type,
        'informationState', v_payment.information_state,
        'source', v_payment.source_id,
        'refundability', v_payment.refundability,
        'competitionRelated', v_payment.competition_related
      );
      v_new := proposal_merge_changes(
        v_item, v_trip_id, v_current, '{"datesSource": "source", "source": "source"}'
      );
      -- No risk-accepted decision is ever passed: accepting a risk stays
      -- a deliberate act on the Payments page, so a change the
      -- acceptance safeguard blocks fails here with its own message.
      perform update_payment_details(
        v_item.target_id,
        v_new ->> 'description',
        (v_new ->> 'totalAmount')::numeric,
        v_new ->> 'currency',
        (v_new ->> 'dueDate')::date,
        (v_new ->> 'cancellationDeadline')::date,
        (v_new ->> 'datesState')::info_state,
        (v_new ->> 'datesSource')::uuid,
        (v_new ->> 'timingType')::payment_timing,
        (v_new ->> 'informationState')::info_state,
        (v_new ->> 'source')::uuid,
        (v_new ->> 'refundability')::refundability,
        (v_new ->> 'competitionRelated')::boolean,
        v_item.reason,
        null
      );
      v_result := v_item.target_id;

    when 'update_fx_rate' then
      select * into v_rate from fx_rates where id = v_item.target_id for update;
      if v_rate.id is null then
        raise exception 'FX rate % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'currency', v_rate.currency,
        'rateToUsd', v_rate.rate_to_usd,
        'rateDate', v_rate.rate_date,
        'rateKind', v_rate.rate_kind,
        'informationState', v_rate.information_state,
        'source', v_rate.source_id
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"source": "source"}');
      perform update_fx_rate(
        v_item.target_id,
        v_new ->> 'currency',
        (v_new ->> 'rateToUsd')::numeric,
        (v_new ->> 'rateDate')::date,
        (v_new ->> 'rateKind')::rate_kind,
        (v_new ->> 'informationState')::info_state,
        (v_new ->> 'source')::uuid,
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_savings_entry' then
      select * into v_entry from savings_entries
      where id = v_item.target_id and trip_id = v_trip_id for update;
      if v_entry.id is null then
        raise exception 'Savings entry % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'amount', v_entry.amount,
        'recordedOn', v_entry.recorded_on,
        'note', v_entry.note
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{}');
      perform update_savings_entry(
        v_item.target_id,
        (v_new ->> 'amount')::numeric,
        (v_new ->> 'recordedOn')::date,
        v_new ->> 'note',
        v_item.reason
      );
      v_result := v_item.target_id;
  end case;

  -- Marking the proposal itself is your decision, not Claude's write.
  perform set_config('app.actor', 'app', true);
  perform set_config('app.change_reason', 'Approved proposal: ' || v_item.reason, true);
  perform set_config('app.approving_proposal', p_item_id::text, true);

  update proposal_items
  set status = 'approved', decided_at = now(), result_id = v_result
  where id = p_item_id
  returning * into v_item;

  perform set_config('app.approving_proposal', '', true);

  return v_item;
end;
$$;

revoke execute on function approve_proposal(uuid) from public, anon;
grant execute on function approve_proposal(uuid) to authenticated;

-- 5. Rejecting. Nothing is discarded: the item stays, with the reason.
--
-- p_cascade rejects every still-pending item that depends on this one,
-- directly or through another item, each with a decision_reason saying
-- which item it went down with. Without it, those items stay pending
-- and the review screen shows them as blocked.
create or replace function reject_proposal(p_item_id uuid, p_reason text, p_cascade boolean)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item proposal_items;
  v_cascaded integer := 0;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  select * into v_item from proposal_items where id = p_item_id for update;
  if v_item.id is null then
    raise exception 'Proposal % not found (or not yours)', p_item_id;
  end if;
  if v_item.status <> 'pending' then
    raise exception 'Proposal % was already %.', p_item_id, v_item.status;
  end if;

  update proposal_items
  set status = 'rejected', decision_reason = p_reason, decided_at = now()
  where id = p_item_id;

  if p_cascade then
    with recursive dependents (position) as (
      select v_item.position
      union
      select pi.position
      from proposal_items pi
      join dependents d on d.position = any (pi.depends_on)
      where pi.batch_id = v_item.batch_id
    )
    update proposal_items
    set status = 'rejected',
        decision_reason = format('Rejected with item %s, which it depends on: %s', v_item.position + 1, p_reason),
        decided_at = now()
    where batch_id = v_item.batch_id
      and position in (select position from dependents)
      and position <> v_item.position
      and status = 'pending';
    get diagnostics v_cascaded = row_count;
  end if;

  return 1 + v_cascaded;
end;
$$;

revoke execute on function reject_proposal(uuid, text, boolean) from public, anon;
grant execute on function reject_proposal(uuid, text, boolean) to authenticated;

-- Closes a batch you're done with: every item still pending is
-- rejected with the reason you give, one by one, so each still says
-- what happened to it. Approved and rejected items are left as they are.
create or replace function close_proposal_batch(p_batch_id uuid, p_reason text)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  if not exists (select 1 from proposal_batches where id = p_batch_id) then
    raise exception 'Proposal batch % not found (or not yours)', p_batch_id;
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update proposal_items
  set status = 'rejected', decision_reason = p_reason, decided_at = now()
  where batch_id = p_batch_id and status = 'pending';
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke execute on function close_proposal_batch(uuid, text) from public, anon;
grant execute on function close_proposal_batch(uuid, text) to authenticated;
