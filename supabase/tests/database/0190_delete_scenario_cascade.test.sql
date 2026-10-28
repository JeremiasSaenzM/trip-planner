-- delete_scenario_cascade, delete_scenario's extended guard
-- (20261026090000_delete_scenario_cascade.sql), and the removal of the
-- approved-proposal-item blocker (20261027090000).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(28);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP cascade trip', 'planning');

-- Scenario A: the happy-path cascade target. Two of its own budget
-- lines (one for a stay, one for a movement), plus a shared,
-- trip-wide line (scenario_id null) that must survive the cascade.
insert into scenarios (id, owner_id, trip_id, name) values (
  'c2000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001', 'pgTAP cascade scenario A'
);

insert into budget_lines (
  id, owner_id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state
) values
  ('c2000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002',
   'C', 'pgTAP own line (stay)', 100, 100, 100, 'USD', 'estimate'),
  ('c2000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002',
   'B', 'pgTAP own line (movement)', 100, 100, 100, 'USD', 'estimate'),
  ('c2000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000001', null,
   'E', 'pgTAP shared line', 50, 50, 50, 'USD', 'estimate');

-- Payment 07: reached only through its budget line (own line 04) --
-- proves the cascade from budget_lines, not an explicit scenario_id.
-- Payment 08: a scenario-specific payment on the *shared* line 06 --
-- the case a budget-line-only cascade would miss. Payment 09: on the
-- same shared line but with no scenario_id of its own -- must survive.
insert into payments (id, owner_id, budget_line_id, scenario_id, description, total_amount, currency) values
  ('c2000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000004', null, 'pgTAP payment via budget line', 10, 'USD'),
  ('c2000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000006', 'c2000000-0000-0000-0000-000000000002',
   'pgTAP payment via scenario_id on a shared line', 20, 'USD'),
  ('c2000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000006', null, 'pgTAP untouched shared-line payment', 30, 'USD');

insert into locations (id, owner_id, name) values
  ('c2000000-0000-0000-0000-00000000001a', '10000000-0000-0000-0000-000000000001', 'Testville'),
  ('c2000000-0000-0000-0000-00000000001b', '10000000-0000-0000-0000-000000000001', 'Home');

insert into stays (id, owner_id, scenario_id, location_id, start_date, nights, budget_line_id) values (
  'c2000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-00000000001a', '2027-01-01', 5,
  'c2000000-0000-0000-0000-000000000004'
);

insert into movements (id, owner_id, scenario_id, sequence, from_location_id, to_location_id, depart_date, arrive_date, budget_line_id) values (
  'c2000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000002', 1, 'c2000000-0000-0000-0000-00000000001b', 'c2000000-0000-0000-0000-00000000001a',
  '2027-01-01', '2027-01-01', 'c2000000-0000-0000-0000-000000000005'
);

insert into sources (id, owner_id, provider, tier, observed_on) values (
  'c2000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'pgTAP source', 6, '2026-10-01'
);

insert into flight_options (
  id, owner_id, scenario_id, label, fare, currency, source_id, observed_on
) values (
  'c2000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000002', 'pgTAP fixture option', 500, 'USD',
  'c2000000-0000-0000-0000-000000000012', '2026-10-01'
);

insert into flight_segments (
  id, owner_id, flight_option_id, direction, segment_order,
  from_airport, to_airport, from_country, to_country, depart_at, arrive_at
) values (
  'c2000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000013', 'outbound', 1, 'MAD', 'CDG', 'ES', 'FR',
  '2027-01-01T06:00:00Z', '2027-01-01T08:00:00Z'
);

-- A decision that unblocks payment 08. It has to survive the cascade
-- that destroys that payment -- only the live pointer should clear.
insert into decisions (id, owner_id, trip_id, title, rationale, payment_id) values (
  'c2000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001', 'pgTAP accept the risk',
  'pgTAP: accepting non-refundable deposit', 'c2000000-0000-0000-0000-000000000008'
);

-- Scenario B: exists only to prove an approved proposal item survives
-- the cascade -- payload, reason and status untouched, result_id left
-- pointing at a row that's now gone.
insert into scenarios (id, owner_id, trip_id, name) values (
  'c2000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001', 'pgTAP cascade scenario B'
);
insert into budget_lines (
  id, owner_id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state
) values (
  'c2000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000020',
  'A', 'pgTAP scenario B line', 10, 10, 10, 'USD', 'estimate'
);
insert into proposal_batches (id, owner_id, trip_id, note, raw_text) values (
  'c2000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001', 'pgTAP research batch', '{}'
);
-- A new proposal must start pending (enforce_proposal_item_rules), and
-- only approve_proposal() may move it to approved -- so this mimics
-- exactly what that function does for the one update that marks it.
insert into proposal_items (
  id, owner_id, batch_id, position, op, payload, reason
) values (
  'c2000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000022', 0, 'create_budget_line', '{}', 'pgTAP proposed it'
);
select set_config('app.actor', 'app', true);
select set_config('app.change_reason', 'Approved proposal: pgTAP proposed it', true);
select set_config('app.approving_proposal', 'c2000000-0000-0000-0000-000000000023', true);
update proposal_items
set status = 'approved', decided_at = now(), result_id = 'c2000000-0000-0000-0000-000000000021'
where id = 'c2000000-0000-0000-0000-000000000023';
select set_config('app.approving_proposal', '', true);

-- Blank reason / not found

select throws_like(
  $$ select delete_scenario_cascade('c2000000-0000-0000-0000-000000000002', '') $$,
  '%reason is required%',
  'delete_scenario_cascade rejects a blank reason'
);

select throws_like(
  $$ select delete_scenario_cascade('00000000-0000-0000-0000-000000000099', 'pgTAP: trying anyway') $$,
  '%not found%',
  'delete_scenario_cascade refuses a scenario that is not found (or not yours)'
);

-- An approved proposal item referencing the scenario no longer blocks
-- the delete -- it's an audit record, not a live reference, and it
-- survives untouched (20261027090000).

select lives_ok(
  $$ select delete_scenario_cascade('c2000000-0000-0000-0000-000000000020', 'pgTAP: cascade delete B') $$,
  'delete_scenario_cascade deletes cleanly despite an approved proposal item referencing it'
);

select is(
  (select count(*) from scenarios where id = 'c2000000-0000-0000-0000-000000000020')::int,
  0,
  'scenario B is gone'
);

select is(
  (select status::text from proposal_items where id = 'c2000000-0000-0000-0000-000000000023'),
  'approved',
  'the approved proposal item keeps its status'
);
select is(
  (select reason from proposal_items where id = 'c2000000-0000-0000-0000-000000000023'),
  'pgTAP proposed it',
  'the approved proposal item keeps its original reason'
);
select is(
  (select result_id::text from proposal_items where id = 'c2000000-0000-0000-0000-000000000023'),
  'c2000000-0000-0000-0000-000000000021',
  'the approved proposal item keeps result_id pointing at the row that''s now gone'
);

-- The real cascade, on scenario A

select lives_ok(
  $$ select delete_scenario_cascade('c2000000-0000-0000-0000-000000000002', 'pgTAP: cascade delete A') $$,
  'delete_scenario_cascade succeeds on scenario A'
);

select is((select count(*) from scenarios where id = 'c2000000-0000-0000-0000-000000000002')::int, 0,
  'scenario A is gone');
select is((select count(*) from budget_lines where id = 'c2000000-0000-0000-0000-000000000004')::int, 0,
  'its own budget line (stay target) is gone');
select is((select count(*) from budget_lines where id = 'c2000000-0000-0000-0000-000000000005')::int, 0,
  'its own budget line (movement target) is gone');
select is((select count(*) from budget_lines where id = 'c2000000-0000-0000-0000-000000000006')::int, 1,
  'the shared budget line survives');
select is((select count(*) from payments where id = 'c2000000-0000-0000-0000-000000000007')::int, 0,
  'the payment reached only via its own budget line is gone');
select is((select count(*) from payments where id = 'c2000000-0000-0000-0000-000000000008')::int, 0,
  'the scenario-specific payment on the shared line is gone');
select is((select count(*) from payments where id = 'c2000000-0000-0000-0000-000000000009')::int, 1,
  'the untouched shared-line payment survives');
select is((select count(*) from stays where id = 'c2000000-0000-0000-0000-000000000010')::int, 0,
  'the stay is gone');
select is((select count(*) from movements where id = 'c2000000-0000-0000-0000-000000000011')::int, 0,
  'the movement is gone');
select is((select count(*) from flight_options where id = 'c2000000-0000-0000-0000-000000000013')::int, 0,
  'the flight option is gone');
select is((select count(*) from flight_segments where id = 'c2000000-0000-0000-0000-000000000014')::int, 0,
  'its flight segment is gone too');

select is((select count(*) from decisions where id = 'c2000000-0000-0000-0000-000000000015')::int, 1,
  'the decision survives the cascade');
select is((select payment_id from decisions where id = 'c2000000-0000-0000-0000-000000000015'), null,
  'the decision''s live payment pointer is cleared');
select is(
  (select reason from change_log
   where table_name = 'decisions' and row_id = 'c2000000-0000-0000-0000-000000000015' and action = 'update'),
  'pgTAP: cascade delete A',
  'the decision update in change_log carries the cascade''s own reason'
);

-- One change_log row per destroyed row, not one for the scenario: 1
-- scenario + 2 budget lines + 2 payments + 1 stay + 1 movement +
-- 1 flight option + 1 flight segment = 9.
select is(
  (select count(*) from change_log where action = 'delete' and reason = 'pgTAP: cascade delete A')::int,
  9,
  'the cascade writes one change_log delete row per destroyed row, not a single summary row'
);

-- delete_scenario's own guard now also covers stays and movements

insert into scenarios (id, owner_id, trip_id, name) values (
  'c2000000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001', 'pgTAP stay-only scenario'
);
insert into stays (id, owner_id, scenario_id, location_id, start_date, nights) values (
  'c2000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000030', 'c2000000-0000-0000-0000-00000000001a', '2027-01-01', 2
);
select throws_like(
  $$ select delete_scenario('c2000000-0000-0000-0000-000000000030', 'pgTAP: trying anyway') $$,
  '%still has stays%',
  'delete_scenario now refuses while stays reference it'
);

insert into scenarios (id, owner_id, trip_id, name) values (
  'c2000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001', 'pgTAP movement-only scenario'
);
insert into movements (id, owner_id, scenario_id, sequence, from_location_id, to_location_id, depart_date, arrive_date) values (
  'c2000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000032', 1, 'c2000000-0000-0000-0000-00000000001b', 'c2000000-0000-0000-0000-00000000001a',
  '2027-01-01', '2027-01-01'
);
select throws_like(
  $$ select delete_scenario('c2000000-0000-0000-0000-000000000032', 'pgTAP: trying anyway') $$,
  '%still has movements%',
  'delete_scenario now refuses while movements reference it'
);

-- Cross-account isolation

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_like(
  $$ select delete_scenario_cascade('c2000000-0000-0000-0000-000000000030', 'not mine') $$,
  '%not found%',
  'a second account cascading my scenario gets "not found"'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- Grants

select ok(has_function_privilege('authenticated', 'delete_scenario_cascade(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_scenario_cascade');
select ok(not has_function_privilege('anon', 'delete_scenario_cascade(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_scenario_cascade');

select * from finish();
rollback;
