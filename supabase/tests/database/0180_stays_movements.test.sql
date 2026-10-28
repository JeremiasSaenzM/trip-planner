-- update_stay / delete_stay / update_movement / delete_movement, and
-- delete_budget_line's extended guard (20261023090000_stays_movements.sql).
-- Updated for Phase 6.5b (20261029090100_locations_backfill.sql):
-- location/from_location/to_location are location_id/from_location_id/
-- to_location_id now, and update_stay/update_movement take uuids there.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(33);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP fixture trip', 'planning');

insert into scenarios (id, owner_id, trip_id, name) values (
  '11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001', 'pgTAP fixture scenario'
);

insert into locations (id, owner_id, name) values
  ('11000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'Testville'),
  ('11000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Home'),
  ('11000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'Testville Renamed'),
  ('11000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'Isolation City');

-- One budget line per guard test, so each can be deleted on its own
-- once the thing referencing it is cleared.
insert into budget_lines (
  id, owner_id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state
) values
  ('11000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   '11000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002',
   'C', 'pgTAP stays guard target', 100, 100, 100, 'USD', 'estimate'),
  ('11000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   '11000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002',
   'B', 'pgTAP movements guard target', 100, 100, 100, 'USD', 'estimate');

-- Stay 1: for the update/delete/guard tests.
insert into stays (id, owner_id, scenario_id, location_id, start_date, nights, budget_line_id) values (
  '11000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000010', '2027-01-01', 5,
  '11000000-0000-0000-0000-000000000003'
);

-- Movement 1: for the update/delete/guard tests. Movement 2 exists only
-- as a sequence collision partner.
insert into movements (id, owner_id, scenario_id, sequence, from_location_id, to_location_id, depart_date, arrive_date, budget_line_id) values (
  '11000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000002', 1, '11000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000010',
  '2027-01-01', '2027-01-01', '11000000-0000-0000-0000-000000000004'
);
insert into movements (id, owner_id, scenario_id, sequence, from_location_id, to_location_id, depart_date, arrive_date) values (
  '11000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000002', 2, '11000000-0000-0000-0000-000000000010', '11000000-0000-0000-0000-000000000011',
  '2027-01-08', '2027-01-08'
);

-- Untouched fixtures for the second-account isolation checks below --
-- kept separate from the ones the update/delete tests above consume.
insert into stays (id, owner_id, scenario_id, location_id, start_date, nights) values (
  '11000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000013', '2027-02-01', 2
);
insert into movements (id, owner_id, scenario_id, sequence, from_location_id, to_location_id, depart_date, arrive_date) values (
  '11000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000002', 3, '11000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000013',
  '2027-02-01', '2027-02-01'
);

-- update_stay / delete_stay

select throws_like(
  $$ select update_stay(
       '11000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000010', '2027-01-01', 5, 'independent',
       '11000000-0000-0000-0000-000000000003', 'estimate', null, null, null, ''
     ) $$,
  '%reason is required%',
  'update_stay rejects a blank reason'
);

select throws_like(
  $$ select update_stay(
       '11000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000010', '2027-01-01', 0, 'independent',
       '11000000-0000-0000-0000-000000000003', 'estimate', null, null, null, 'pgTAP: zero nights'
     ) $$,
  '%stays_nights_positive%',
  'update_stay still enforces nights > 0'
);

select lives_ok(
  $$ select update_stay(
       '11000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000012', '2027-01-01', 6, 'festival',
       '11000000-0000-0000-0000-000000000003', 'estimate', null, null, null, 'pgTAP: updating it'
     ) $$,
  'update_stay succeeds with a real reason'
);

select results_eq(
  $$ select location_id, nights, kind from stays where id = '11000000-0000-0000-0000-000000000005' $$,
  $$ values ('11000000-0000-0000-0000-000000000012'::uuid, 6::smallint, 'festival'::stay_kind) $$,
  'the stay was actually updated'
);

select throws_like(
  $$ select delete_budget_line('11000000-0000-0000-0000-000000000003', 'pgTAP: trying anyway') $$,
  '%still has stays attached%',
  'delete_budget_line refuses while a stay still references it'
);

select lives_ok(
  $$ select update_stay(
       '11000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000012', '2027-01-01', 6, 'festival',
       null, 'estimate', null, null, null, 'pgTAP: unlinking the budget line'
     ) $$,
  'update_stay can clear budget_line_id'
);

select lives_ok(
  $$ select delete_budget_line('11000000-0000-0000-0000-000000000003', 'pgTAP: now nothing references it') $$,
  'delete_budget_line succeeds once the stay no longer references it'
);

select throws_like(
  $$ select delete_stay('11000000-0000-0000-0000-000000000005', '') $$,
  '%reason is required%',
  'delete_stay rejects a blank reason'
);

select lives_ok(
  $$ select delete_stay('11000000-0000-0000-0000-000000000005', 'pgTAP: removing it') $$,
  'delete_stay succeeds with a real reason'
);

select is(
  (select count(*) from stays where id = '11000000-0000-0000-0000-000000000005')::int,
  0,
  'the stay is actually gone'
);

-- update_movement / delete_movement

select throws_like(
  $$ select update_movement(
       '11000000-0000-0000-0000-000000000006', 1, '11000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000010',
       '2027-01-01', null, '2027-01-01', null,
       'plane', '11000000-0000-0000-0000-000000000004', null, 'estimate', null, null, null, ''
     ) $$,
  '%reason is required%',
  'update_movement rejects a blank reason'
);

select throws_like(
  $$ select update_movement(
       '11000000-0000-0000-0000-000000000006', 1, '11000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000010',
       '2027-01-02', null, '2027-01-01', null,
       'plane', '11000000-0000-0000-0000-000000000004', null, 'estimate', null, null, null, 'pgTAP: backwards'
     ) $$,
  '%movements_arrive_after_depart%',
  'update_movement still enforces arrive_date >= depart_date'
);

select throws_like(
  $$ select update_movement(
       '11000000-0000-0000-0000-000000000006', 2, '11000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000010',
       '2027-01-01', null, '2027-01-01', null,
       'plane', '11000000-0000-0000-0000-000000000004', null, 'estimate', null, null, null, 'pgTAP: colliding on purpose'
     ) $$,
  '%movements_sequence_unique%',
  'update_movement still enforces one sequence position per scenario'
);

select lives_ok(
  $$ select update_movement(
       '11000000-0000-0000-0000-000000000006', 1, '11000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000012',
       '2027-01-01', null, '2027-01-01', null,
       'train', '11000000-0000-0000-0000-000000000004', 'PGT123', 'estimate', null, null, null, 'pgTAP: updating it'
     ) $$,
  'update_movement succeeds with a real reason'
);

select results_eq(
  $$ select to_location_id, mode, booking_reference from movements where id = '11000000-0000-0000-0000-000000000006' $$,
  $$ values ('11000000-0000-0000-0000-000000000012'::uuid, 'train'::movement_mode, 'PGT123'::text) $$,
  'the movement was actually updated'
);

select throws_like(
  $$ select delete_budget_line('11000000-0000-0000-0000-000000000004', 'pgTAP: trying anyway') $$,
  '%still has movements attached%',
  'delete_budget_line refuses while a movement still references it'
);

select lives_ok(
  $$ select update_movement(
       '11000000-0000-0000-0000-000000000006', 1, '11000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000012',
       '2027-01-01', null, '2027-01-01', null,
       'train', null, 'PGT123', 'estimate', null, null, null, 'pgTAP: unlinking the budget line'
     ) $$,
  'update_movement can clear budget_line_id'
);

select lives_ok(
  $$ select delete_budget_line('11000000-0000-0000-0000-000000000004', 'pgTAP: now nothing references it') $$,
  'delete_budget_line succeeds once the movement no longer references it'
);

select throws_like(
  $$ select delete_movement('11000000-0000-0000-0000-000000000006', '') $$,
  '%reason is required%',
  'delete_movement rejects a blank reason'
);

select lives_ok(
  $$ select delete_movement('11000000-0000-0000-0000-000000000006', 'pgTAP: removing it') $$,
  'delete_movement succeeds with a real reason'
);

select is(
  (select count(*) from movements where id = '11000000-0000-0000-0000-000000000006')::int,
  0,
  'the movement is actually gone'
);

-- A second account can't touch either table's RPCs.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_like(
  $$ select update_stay(
       '11000000-0000-0000-0000-000000000008', '11000000-0000-0000-0000-000000000013', '2027-02-01', 2, 'independent', null, 'estimate', null, null,
       null, 'not mine'
     ) $$,
  '%not found%',
  'a second account updating my stay gets "not found"'
);

select throws_like(
  $$ select delete_stay('11000000-0000-0000-0000-000000000008', 'not mine') $$,
  '%not found%',
  'a second account deleting my stay also gets "not found"'
);

select throws_like(
  $$ select update_movement(
       '11000000-0000-0000-0000-000000000009', 3, '11000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000013',
       '2027-02-01', null, '2027-02-01', null,
       'plane', null, null, 'estimate', null, null, null, 'not mine'
     ) $$,
  '%not found%',
  'a second account updating my movement gets "not found"'
);

select throws_like(
  $$ select delete_movement('11000000-0000-0000-0000-000000000009', 'not mine') $$,
  '%not found%',
  'a second account deleting my movement also gets "not found"'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- Grants: authenticated can call every RPC here, anon can't.
select ok(has_function_privilege('authenticated',
  'update_stay(uuid, uuid, date, integer, stay_kind, uuid, info_state, uuid, text, uuid, text)', 'EXECUTE'),
  'authenticated can execute update_stay');
select ok(not has_function_privilege('anon',
  'update_stay(uuid, uuid, date, integer, stay_kind, uuid, info_state, uuid, text, uuid, text)', 'EXECUTE'),
  'anon cannot execute update_stay');
select ok(has_function_privilege('authenticated', 'delete_stay(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_stay');
select ok(not has_function_privilege('anon', 'delete_stay(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_stay');
select ok(has_function_privilege('authenticated',
  'update_movement(uuid, integer, uuid, uuid, date, time, date, time, movement_mode, uuid, text, info_state, uuid, text, uuid, text)',
  'EXECUTE'),
  'authenticated can execute update_movement');
select ok(not has_function_privilege('anon',
  'update_movement(uuid, integer, uuid, uuid, date, time, date, time, movement_mode, uuid, text, info_state, uuid, text, uuid, text)',
  'EXECUTE'),
  'anon cannot execute update_movement');
select ok(has_function_privilege('authenticated', 'delete_movement(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_movement');
select ok(not has_function_privilege('anon', 'delete_movement(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_movement');

select * from finish();
rollback;
