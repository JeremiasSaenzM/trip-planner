-- Import proposals (20261021090000_import_proposals.sql): the two
-- tables, create_proposal_batch, approve_proposal, reject_proposal,
-- close_proposal_batch, and change_log's reason rule for 'claude'.
--
-- Every item below carries a unique ref purely so the tests can find it
-- again by name; the app only sets ref on creates.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(72);

select has_table('proposal_batches', 'proposal_batches exists');
select has_table('proposal_items', 'proposal_items exists');
select enum_has_labels('proposal_op', array[
  'create_source', 'create_competition', 'create_scenario', 'create_budget_line', 'create_payment', 'create_fx_rate',
  'update_competition', 'update_scenario', 'update_budget_line', 'update_payment', 'update_fx_rate', 'update_savings_entry',
  'create_stay', 'create_movement', 'update_stay', 'update_movement',
  'create_flight_option', 'create_flight_segment', 'update_flight_option',
  'create_location', 'update_location'
], 'proposal_op is exactly the twenty-one operations (v1 plus stays/movements plus flights plus locations)');
select enum_has_labels('proposal_status', array['pending', 'approved', 'rejected'], 'proposal_status is pending / approved / rejected');
select ok((select relrowsecurity from pg_class where oid = 'proposal_batches'::regclass), 'RLS is on for proposal_batches');
select ok((select relrowsecurity from pg_class where oid = 'proposal_items'::regclass), 'RLS is on for proposal_items');

set local role authenticated;

-- The second account owns one source, so a proposal can try to reach it.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
insert into sources (id, owner_id, provider, tier, observed_on) values (
  'b2000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000002', 'Someone else''s source', 1, '2026-10-01'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('b2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP proposals trip', 'planning');
insert into sources (id, owner_id, provider, tier, observed_on) values (
  'b2000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'pgTAP fare source', 2, '2026-10-01'
);
insert into competitions (id, trip_id, name) values
  ('b2000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000001', 'pgTAP existing competition');
insert into scenarios (id, trip_id, name, competition_id) values (
  'b2000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-000000000001', 'pgTAP existing scenario',
  'b2000000-0000-0000-0000-000000000003'
);
insert into budget_lines (
  id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state
) values (
  'b2000000-0000-0000-0000-000000000005', 'b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000004',
  'B', 'pgTAP flights line', 1500, 2100, 2500, 'EUR', 'estimate'
);
-- Committed is allowed here only because it's refundable -- making it
-- non-refundable is exactly what the acceptance safeguard refuses.
insert into payments (
  id, budget_line_id, scenario_id, description, total_amount, currency,
  status, refundability, competition_related
) values (
  'b2000000-0000-0000-0000-000000000006', 'b2000000-0000-0000-0000-000000000005',
  'b2000000-0000-0000-0000-000000000004', 'pgTAP deposit', 200, 'EUR', 'committed', 'refundable', true
);
insert into locations (id, owner_id, name) values
  ('b2000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Home'),
  ('b2000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'pgTAP existing stay'),
  ('b2000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'pgTAP stay');
insert into stays (id, scenario_id, location_id, start_date, nights, kind, information_state) values (
  'b2000000-0000-0000-0000-000000000010', 'b2000000-0000-0000-0000-000000000004',
  'b2000000-0000-0000-0000-00000000000b', '2027-07-01', 5, 'independent', 'estimate'
);
insert into movements (id, scenario_id, sequence, from_location_id, to_location_id, depart_date, arrive_date, mode, information_state) values (
  'b2000000-0000-0000-0000-000000000011', 'b2000000-0000-0000-0000-000000000004',
  1, 'b2000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000b', '2027-07-01', '2027-07-01', 'plane', 'estimate'
);

-- Saving a batch

select lives_ok(
  $$ select create_proposal_batch(
       'b2000000-0000-0000-0000-000000000001', 'pgTAP batch one', '{"raw": "as pasted"}',
       '[
         {"position": 0, "ref": "b1-comp", "op": "create_competition", "reason": "pgTAP: festival announced",
          "payload": {"data": {"name": "Proposed Festival", "datesState": "pending"}}, "dependsOn": []},
         {"position": 1, "ref": "b1-scn", "op": "create_scenario", "reason": "pgTAP: a scenario for it",
          "payload": {"data": {"name": "Proposed scenario", "competition": {"item": 0}}}, "dependsOn": [0]},
         {"position": 2, "ref": "b1-line", "op": "create_budget_line", "reason": "pgTAP: fare research",
          "payload": {"data": {"scenario": {"item": 1}, "category": "B", "description": "Proposed flights",
            "amountMin": 900, "amountTarget": 1000, "amountConservative": 1200, "currency": "EUR",
            "informationState": "estimate", "source": {"id": "b2000000-0000-0000-0000-000000000002"}}},
          "dependsOn": [1]},
         {"position": 3, "ref": "b1-update", "op": "update_budget_line", "reason": "pgTAP: cheaper fare found",
          "targetId": "b2000000-0000-0000-0000-000000000005",
          "payload": {"changes": {"amountTarget": {"from": 2100, "to": 1650}}}},
         {"position": 4, "ref": "b1-stale", "op": "update_budget_line", "reason": "pgTAP: written against old data",
          "targetId": "b2000000-0000-0000-0000-000000000005",
          "payload": {"changes": {"amountMin": {"from": 1, "to": 2}}}},
         {"position": 5, "ref": "b1-field", "op": "update_budget_line", "reason": "pgTAP: not a field",
          "targetId": "b2000000-0000-0000-0000-000000000005",
          "payload": {"changes": {"tripId": {"from": null, "to": "b2000000-0000-0000-0000-000000000001"}}}},
         {"position": 6, "ref": "b1-safeguard", "op": "update_payment", "reason": "pgTAP: turns out non-refundable",
          "targetId": "b2000000-0000-0000-0000-000000000006",
          "payload": {"changes": {"refundability": {"from": "refundable", "to": "non_refundable"}}}},
         {"position": 7, "ref": "b1-order", "op": "create_budget_line", "reason": "pgTAP: amounts out of order",
          "payload": {"data": {"scenario": {"id": "b2000000-0000-0000-0000-000000000004"}, "category": "E",
            "description": "Backwards amounts", "amountMin": 500, "amountTarget": 100, "amountConservative": 50,
            "currency": "EUR", "informationState": "estimate"}}},
         {"position": 8, "ref": "b1-foreign", "op": "create_budget_line", "reason": "pgTAP: someone else''s source",
          "payload": {"data": {"category": "E", "description": "Foreign source line", "amountMin": 1,
            "amountTarget": 1, "amountConservative": 1, "currency": "EUR", "informationState": "estimate",
            "source": {"id": "b2000000-0000-0000-0000-000000000099"}}}},
         {"position": 9, "ref": "b1-stay", "op": "create_stay", "reason": "pgTAP: a stay for the new scenario",
          "payload": {"data": {"scenario": {"item": 1}, "location": {"id": "b2000000-0000-0000-0000-00000000000c"}, "startDate": "2027-07-01",
            "nights": 3, "kind": "independent", "informationState": "estimate"}}, "dependsOn": [1]},
         {"position": 10, "ref": "b1-move", "op": "create_movement", "reason": "pgTAP: a movement for the new scenario",
          "payload": {"data": {"scenario": {"item": 1}, "sequence": 1, "fromLocation": {"id": "b2000000-0000-0000-0000-00000000000a"},
            "toLocation": {"id": "b2000000-0000-0000-0000-00000000000c"},
            "departDate": "2027-07-01", "arriveDate": "2027-07-01", "mode": "plane", "informationState": "estimate"}},
          "dependsOn": [1]},
         {"position": 11, "ref": "b1-update-stay", "op": "update_stay", "reason": "pgTAP: nights corrected",
          "targetId": "b2000000-0000-0000-0000-000000000010",
          "payload": {"changes": {"nights": {"from": 5, "to": 6}}}},
         {"position": 12, "ref": "b1-update-stay-stale", "op": "update_stay", "reason": "pgTAP: written against old data",
          "targetId": "b2000000-0000-0000-0000-000000000010",
          "payload": {"changes": {"location": {"from": "b2000000-0000-0000-0000-00000000000a", "to": {"id": "b2000000-0000-0000-0000-00000000000c"}}}}},
         {"position": 13, "ref": "b1-update-stay-field", "op": "update_stay", "reason": "pgTAP: not a field",
          "targetId": "b2000000-0000-0000-0000-000000000010",
          "payload": {"changes": {"scenarioId": {"from": null, "to": "b2000000-0000-0000-0000-000000000004"}}}},
         {"position": 14, "ref": "b1-update-move", "op": "update_movement", "reason": "pgTAP: sequence corrected",
          "targetId": "b2000000-0000-0000-0000-000000000011",
          "payload": {"changes": {"sequence": {"from": 1, "to": 2}}}}
       ]'::jsonb
     ) $$,
  'create_proposal_batch saves a batch'
);

select is(
  (select count(*)::int from proposal_items i join proposal_batches b on b.id = i.batch_id where b.note = 'pgTAP batch one'),
  15,
  'every item of the batch was saved, all pending'
);

select throws_like(
  $$ select create_proposal_batch('b2000000-0000-0000-0000-000000000001', null, '{}',
       '[{"position": 0, "op": "update_stay", "reason": "x", "targetId": "b2000000-0000-0000-0000-0000000000fd",
          "payload": {"changes": {}}}]'::jsonb) $$,
  '%the row it updates was not found (or not yours)%',
  'an update_stay whose target doesn''t exist is refused when the batch is saved'
);

select throws_like(
  $$ select create_proposal_batch('b2000000-0000-0000-0000-0000000000ff', null, '{}',
       '[{"position": 0, "op": "create_source", "reason": "x", "payload": {"data": {}}}]'::jsonb) $$,
  '%Trip % not found (or not yours)%',
  'a batch for a trip that isn''t yours is refused'
);

select throws_like(
  $$ select create_proposal_batch('b2000000-0000-0000-0000-000000000001', null, '{}',
       '[{"position": 0, "op": "update_budget_line", "reason": "x", "targetId": "b2000000-0000-0000-0000-0000000000fe",
          "payload": {"changes": {}}}]'::jsonb) $$,
  '%the row it updates was not found (or not yours)%',
  'an update whose target doesn''t exist is refused when the batch is saved'
);

select throws_like(
  $$ select create_proposal_batch('b2000000-0000-0000-0000-000000000001', null, '{}',
       '[{"position": 0, "op": "create_scenario", "reason": "x", "payload": {"data": {}}, "dependsOn": [1]},
         {"position": 1, "op": "create_competition", "reason": "x", "payload": {"data": {}}}]'::jsonb) $$,
  '%can only depend on items before it%',
  'a forward dependency is refused'
);

select throws_like(
  $$ select create_proposal_batch('b2000000-0000-0000-0000-000000000001', null, '{}',
       '[{"position": 0, "op": "delete_trip", "reason": "x", "payload": {}}]'::jsonb) $$,
  '%invalid input value for enum proposal_op%',
  'an operation outside the whitelist can''t be stored'
);

-- Approving: dependencies, references, the audit trail

select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-scn')) $$,
  '%isn''t approved yet%',
  'an item can''t be approved before what it depends on'
);

select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-comp')) $$,
  'approving the competition create succeeds'
);

select results_eq(
  $$ select status::text, result_id = (select id from competitions where name = 'Proposed Festival')
     from proposal_items where ref = 'b1-comp' $$,
  $$ values ('approved'::text, true) $$,
  'the item is approved and points at the competition it created'
);

select results_eq(
  $$ select actor, reason, changed_by from change_log
     where table_name = 'competitions' and action = 'insert'
       and row_id = (select result_id from proposal_items where ref = 'b1-comp') $$,
  $$ values ('claude'::text, 'pgTAP: festival announced'::text, '10000000-0000-0000-0000-000000000001'::uuid) $$,
  'change_log records the write as Claude''s, with the proposal''s reason, approved by you'
);

select results_eq(
  $$ select actor, reason from change_log
     where table_name = 'proposal_items' and action = 'update'
       and row_id = (select id from proposal_items where ref = 'b1-comp') $$,
  $$ values ('app'::text, 'Approved proposal: pgTAP: festival announced'::text) $$,
  'marking the proposal approved is logged as your own decision'
);

select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-comp')) $$,
  '%was already approved%',
  'an item can''t be approved twice'
);

select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-scn')) $$,
  'the scenario can be approved once its competition is'
);

select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-line')) $$,
  'the budget line can be approved once its scenario is'
);

select results_eq(
  $$ select scenario_id = (select result_id from proposal_items where ref = 'b1-scn'),
            (select competition_id from scenarios where id = budget_lines.scenario_id)
              = (select result_id from proposal_items where ref = 'b1-comp'),
            source_id
     from budget_lines where description = 'Proposed flights' $$,
  $$ values (true, true, 'b2000000-0000-0000-0000-000000000002'::uuid) $$,
  'references inside the batch resolved to the rows the earlier approvals created'
);

-- Stays and movements: a plain insert, same as create_budget_line

select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-stay')) $$,
  'the stay can be approved once its scenario is'
);

select results_eq(
  $$ select scenario_id = (select result_id from proposal_items where ref = 'b1-scn'), location_id, nights, kind::text
     from stays where location_id = 'b2000000-0000-0000-0000-00000000000c' $$,
  $$ values (true, 'b2000000-0000-0000-0000-00000000000c'::uuid, 3::smallint, 'independent'::text) $$,
  'the stay''s scenario reference resolved to the scenario the earlier approval created'
);

select results_eq(
  $$ select actor, reason from change_log
     where table_name = 'stays' and action = 'insert'
       and row_id = (select result_id from proposal_items where ref = 'b1-stay') $$,
  $$ values ('claude'::text, 'pgTAP: a stay for the new scenario'::text) $$,
  'the stay''s creation is logged as Claude''s, with the proposal''s reason'
);

select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-move')) $$,
  'the movement can be approved once its scenario is'
);

select results_eq(
  $$ select scenario_id = (select result_id from proposal_items where ref = 'b1-scn'), from_location_id, to_location_id
     from movements where to_location_id = 'b2000000-0000-0000-0000-00000000000c' $$,
  $$ values (true, 'b2000000-0000-0000-0000-00000000000a'::uuid, 'b2000000-0000-0000-0000-00000000000c'::uuid) $$,
  'the movement''s scenario reference resolved the same way'
);

-- Updates: same RPC as the edit form, refused when stale

select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-update')) $$,
  'an update whose "from" still matches is approved'
);

select is(
  (select amount_target from budget_lines where id = 'b2000000-0000-0000-0000-000000000005'),
  1650.00::numeric,
  'the update went through: target is now 1650'
);

select results_eq(
  $$ select actor, reason, (old_data ->> 'amount_target')::numeric, (new_data ->> 'amount_target')::numeric
     from change_log
     where table_name = 'budget_lines' and action = 'update' and row_id = 'b2000000-0000-0000-0000-000000000005' $$,
  $$ values ('claude'::text, 'pgTAP: cheaper fare found'::text, 2100.00::numeric, 1650.00::numeric) $$,
  'change_log has the before and after, the proposal''s reason, and actor claude'
);

select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-stale')) $$,
  '%Proposal is out of date: amountMin is now%',
  'an update whose "from" no longer matches is refused, never applied over the current value'
);

select results_eq(
  $$ select i.status::text, bl.amount_min
     from proposal_items i, budget_lines bl
     where i.ref = 'b1-stale' and bl.id = 'b2000000-0000-0000-0000-000000000005' $$,
  $$ values ('pending'::text, 1500.00::numeric) $$,
  'the stale item stays pending and the line is untouched'
);

select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-field')) $$,
  '%Proposal changes a field it can''t: tripId%',
  'a field outside the operation''s whitelist is refused, not ignored'
);

-- The same stale check and field whitelist, for update_stay and update_movement

select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-update-stay')) $$,
  'an update_stay whose "from" still matches is approved'
);

select is(
  (select nights from stays where id = 'b2000000-0000-0000-0000-000000000010'),
  6::smallint,
  'the update went through: nights is now 6'
);

select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-update-stay-stale')) $$,
  '%Proposal is out of date: location is now%',
  'an update_stay whose "from" no longer matches is refused, never applied over the current value'
);

select results_eq(
  $$ select i.status::text, s.location_id
     from proposal_items i, stays s
     where i.ref = 'b1-update-stay-stale' and s.id = 'b2000000-0000-0000-0000-000000000010' $$,
  $$ values ('pending'::text, 'b2000000-0000-0000-0000-00000000000b'::uuid) $$,
  'the stale item stays pending and the stay is untouched'
);

select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-update-stay-field')) $$,
  '%Proposal changes a field it can''t: scenarioId%',
  'update_stay refuses a field outside its whitelist too -- a stay can''t be relocated to another scenario this way'
);

select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-update-move')) $$,
  'an update_movement whose "from" still matches is approved'
);

select is(
  (select sequence from movements where id = 'b2000000-0000-0000-0000-000000000011'),
  2::smallint,
  'the update went through: sequence is now 2'
);

-- The same rules as manual entry

select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-safeguard')) $$,
  '%non-refundable/unknown, competition-related commitment%',
  'the acceptance safeguard blocks an approval exactly as it blocks the form'
);

select results_eq(
  $$ select i.status::text, p.refundability::text
     from proposal_items i, payments p
     where i.ref = 'b1-safeguard' and p.id = 'b2000000-0000-0000-0000-000000000006' $$,
  $$ values ('pending'::text, 'refundable'::text) $$,
  'the blocked item stays pending and the payment is unchanged'
);

select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-order')) $$,
  '%budget_lines_amount_order%',
  'a check constraint refuses an approval the same way it refuses the form'
);

select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-foreign')) $$,
  '%Source % not found (or not yours)%',
  'a reference to another account''s row is refused'
);

-- Approval is not a back door: no shortcut around approve_proposal()

select throws_like(
  $$ update proposal_items set status = 'approved', decided_at = now(),
       result_id = 'b2000000-0000-0000-0000-000000000005'
     where ref = 'b1-stale' $$,
  '%can only be approved through approve_proposal()%',
  'marking an item approved directly is refused'
);

select throws_like(
  $$ update proposal_items set payload = '{"changes": {}}' where ref = 'b1-stale' $$,
  '%can''t be edited%',
  'a proposal''s content can''t be edited after it''s pasted'
);

select throws_like(
  $$ insert into proposal_items (batch_id, position, op, payload, reason, status, decided_at, result_id)
     values ((select id from proposal_batches where note = 'pgTAP batch one'), 99, 'create_source', '{}',
       'x', 'approved', now(), 'b2000000-0000-0000-0000-000000000002') $$,
  '%must start pending%',
  'an item can''t be inserted already approved'
);

select throws_like(
  $$ delete from proposal_items where ref = 'b1-stale' $$,
  '%permission denied for table proposal_items%',
  'nothing is discarded: proposal items can''t be deleted'
);

-- A Claude-originated write without a reason is refused even for an
-- insert, which is otherwise exempt.
select set_config('app.change_reason', '', true);
select set_config('app.actor', 'claude', true);
select throws_like(
  $$ insert into sources (provider, tier, observed_on) values ('Unexplained', 6, '2026-10-01') $$,
  '%reason is required for every Claude-originated write%',
  'actor claude is never exempt from the reason requirement, not even for an insert'
);
select set_config('app.actor', 'app', true);

-- Another account

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'b1-stale')) $$,
  '%not found (or not yours)%',
  'another account can''t approve your proposal'
);

select throws_like(
  $$ select reject_proposal('00000000-0000-0000-0000-000000000000', 'not mine', false) $$,
  '%not found (or not yours)%',
  'rejecting a proposal that isn''t yours is refused'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- Rejecting: with and without what depends on it

select lives_ok(
  $$ select create_proposal_batch('b2000000-0000-0000-0000-000000000001', 'pgTAP batch two', '{}',
       '[{"position": 0, "ref": "b2-scn", "op": "create_scenario", "reason": "pgTAP",
          "payload": {"data": {"name": "Doomed scenario"}}},
         {"position": 1, "ref": "b2-line", "op": "create_budget_line", "reason": "pgTAP", "dependsOn": [0],
          "payload": {"data": {"scenario": {"item": 0}, "category": "A", "description": "Doomed line",
            "amountMin": 1, "amountTarget": 1, "amountConservative": 1, "currency": "EUR", "informationState": "estimate"}}},
         {"position": 2, "ref": "b2-pay", "op": "create_payment", "reason": "pgTAP", "dependsOn": [1],
          "payload": {"data": {"budgetLine": {"item": 1}, "description": "Doomed payment", "currency": "EUR",
            "totalAmount": 1, "refundability": "refundable", "timingType": "unknown", "competitionRelated": false}}}
       ]'::jsonb) $$,
  'a second batch with a dependency chain is saved'
);

select lives_ok(
  $$ select create_proposal_batch('b2000000-0000-0000-0000-000000000001', 'pgTAP batch three', '{}',
       '[{"position": 0, "ref": "b3-scn", "op": "create_scenario", "reason": "pgTAP",
          "payload": {"data": {"name": "Kept-waiting scenario"}}},
         {"position": 1, "ref": "b3-line", "op": "create_budget_line", "reason": "pgTAP", "dependsOn": [0],
          "payload": {"data": {"scenario": {"item": 0}, "category": "A", "description": "Kept-waiting line",
            "amountMin": 1, "amountTarget": 1, "amountConservative": 1, "currency": "EUR", "informationState": "estimate"}}}
       ]'::jsonb) $$,
  'a third batch is saved'
);

select throws_like(
  $$ select reject_proposal((select id from proposal_items where ref = 'b2-scn'), '  ', true) $$,
  '%reason is required%',
  'rejecting needs a reason'
);

select is(
  reject_proposal((select id from proposal_items where ref = 'b2-scn'), 'pgTAP: host withdrew', true),
  3,
  'rejecting with cascade rejects the item and everything that depends on it, directly or not'
);

select results_eq(
  $$ select status::text from proposal_items where ref in ('b2-scn', 'b2-line', 'b2-pay') order by position $$,
  $$ values ('rejected'::text), ('rejected'::text), ('rejected'::text) $$,
  'all three items of the chain are rejected'
);

select ok(
  (select decision_reason like 'Rejected with item 1, which it depends on: pgTAP: host withdrew'
   from proposal_items where ref = 'b2-pay'),
  'a cascaded rejection says which item it went down with, and why'
);

select results_eq(
  $$ select reason from change_log
     where table_name = 'proposal_items' and action = 'update'
       and row_id = (select id from proposal_items where ref = 'b2-scn') $$,
  $$ values ('pgTAP: host withdrew'::text) $$,
  'the rejection is in change_log with its reason'
);

select is(
  reject_proposal((select id from proposal_items where ref = 'b3-scn'), 'pgTAP: not this one', false),
  1,
  'rejecting without cascade rejects only that item'
);

select is(
  (select status::text from proposal_items where ref = 'b3-line'),
  'pending',
  'what depended on it stays pending, not silently discarded'
);

select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'b3-line')) $$,
  '%isn''t approved yet%',
  'an item whose dependency was rejected can''t be approved'
);

select is(
  close_proposal_batch((select id from proposal_batches where note = 'pgTAP batch three'), 'pgTAP: done with this batch'),
  1,
  'closing a batch rejects what was still pending in it'
);

select results_eq(
  $$ select status::text, decision_reason from proposal_items where ref = 'b3-line' $$,
  $$ values ('rejected'::text, 'pgTAP: done with this batch'::text) $$,
  'the closed item carries the closing reason'
);

select throws_like(
  $$ select reject_proposal((select id from proposal_items where ref = 'b3-scn'), 'again', false) $$,
  '%was already rejected%',
  'an item can''t be decided twice'
);

-- Grants

select ok(has_function_privilege('authenticated', 'create_proposal_batch(uuid, text, text, jsonb)', 'EXECUTE'),
  'authenticated can execute create_proposal_batch');
select ok(not has_function_privilege('anon', 'create_proposal_batch(uuid, text, text, jsonb)', 'EXECUTE'),
  'anon cannot execute create_proposal_batch');
select ok(has_function_privilege('authenticated', 'approve_proposal(uuid)', 'EXECUTE'),
  'authenticated can execute approve_proposal');
select ok(not has_function_privilege('anon', 'approve_proposal(uuid)', 'EXECUTE'),
  'anon cannot execute approve_proposal');
select ok(has_function_privilege('authenticated', 'reject_proposal(uuid, text, boolean)', 'EXECUTE'),
  'authenticated can execute reject_proposal');
select ok(not has_function_privilege('anon', 'reject_proposal(uuid, text, boolean)', 'EXECUTE'),
  'anon cannot execute reject_proposal');
select ok(has_function_privilege('authenticated', 'close_proposal_batch(uuid, text)', 'EXECUTE'),
  'authenticated can execute close_proposal_batch');
select ok(not has_function_privilege('anon', 'close_proposal_batch(uuid, text)', 'EXECUTE'),
  'anon cannot execute close_proposal_batch');

select * from finish();
rollback;
