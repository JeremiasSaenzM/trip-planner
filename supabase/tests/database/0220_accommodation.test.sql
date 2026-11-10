-- Phase 6.6: accommodation (20261101090000_accommodation_options.sql,
-- 20261101090100_proposal_ops_accommodation.sql). Covers the
-- at-most-one-selected-or-booked partial unique index, the
-- conditional_rate/undiscounted_amount constraint, the new RPCs, and
-- the two new proposal ops round-tripping through approve_proposal().
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(34);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('13000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP fixture trip', 'planning');
insert into scenarios (id, owner_id, trip_id, name) values (
  '13000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000001', 'pgTAP fixture scenario'
);
insert into sources (id, owner_id, provider, tier, observed_on) values (
  '13000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'pgTAP rate source', 2, '2026-10-01'
);
insert into locations (id, owner_id, name) values
  ('13000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Testville');
insert into stays (id, owner_id, scenario_id, location_id, start_date, nights, kind, information_state) values (
  '13000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-00000000000a', '2027-07-01', 5, 'event', 'estimate'
);
insert into accommodation_options (id, owner_id, stay_id, label, property_name, rate_amount, rate_unit, nights, currency, source_id, observed_on) values (
  '13000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000004', 'pgTAP option one', 'Hotel One', 100, 'per_night', 5, 'USD',
  '13000000-0000-0000-0000-000000000003', '2026-10-01'
);
insert into accommodation_options (id, owner_id, stay_id, label, property_name, rate_amount, rate_unit, nights, currency, source_id, observed_on) values (
  '13000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000004', 'pgTAP option two', 'Hotel Two', 120, 'per_night', 5, 'USD',
  '13000000-0000-0000-0000-000000000003', '2026-10-01'
);

-- At most one selected/booked option per stay (partial unique index).
select set_config('app.change_reason', 'pgTAP: exercising the partial unique index', true);

select lives_ok(
  $$ update accommodation_options set status = 'selected' where id = '13000000-0000-0000-0000-000000000005' $$,
  'the first option can be marked selected'
);
select throws_like(
  $$ update accommodation_options set status = 'selected' where id = '13000000-0000-0000-0000-000000000006' $$,
  '%accommodation_options_one_selected_or_booked_per_stay%',
  'a second selected option for the same stay is refused'
);
select throws_like(
  $$ update accommodation_options set status = 'booked' where id = '13000000-0000-0000-0000-000000000006' $$,
  '%accommodation_options_one_selected_or_booked_per_stay%',
  'booked collides with an already-selected option too'
);
select lives_ok(
  $$ update accommodation_options set status = 'candidate' where id = '13000000-0000-0000-0000-000000000005' $$,
  'freeing up the slot lets the other option take it'
);

-- conditional_rate implies undiscounted_amount.
select throws_like(
  $$ insert into accommodation_options (
       owner_id, stay_id, label, property_name, rate_amount, rate_unit, nights, currency,
       source_id, observed_on, conditional_rate
     ) values (
       '10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000004', 'bad', 'Bad Hotel',
       80, 'per_night', 5, 'USD', '13000000-0000-0000-0000-000000000003', '2026-10-01', true
     ) $$,
  '%accommodation_options_conditional_needs_undiscounted%',
  'a conditional rate with no undiscounted amount is rejected'
);
select lives_ok(
  $$ insert into accommodation_options (
       owner_id, stay_id, label, property_name, rate_amount, rate_unit, nights, currency,
       source_id, observed_on, conditional_rate, undiscounted_amount
     ) values (
       '10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000004', 'ok', 'OK Hotel',
       80, 'per_night', 5, 'USD', '13000000-0000-0000-0000-000000000003', '2026-10-01', true, 95
     ) $$,
  'a conditional rate with an undiscounted amount is accepted'
);

-- Phase 6.11: an accommodation figure must be backed by the nights it
-- funds. The stay (id ...004) runs 2027-07-01, 5 nights.
select throws_like(
  $$ insert into accommodation_options (
       owner_id, stay_id, label, property_name, rate_amount, rate_unit, nights, currency,
       source_id, observed_on, observed_start_date
     ) values (
       '10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000004', 'bad nights', 'Bad Hotel',
       80, 'per_night', 3, 'USD', '13000000-0000-0000-0000-000000000003', '2026-10-01', '2027-07-01'
     ) $$,
  '%accommodation figure must be backed by the nights it funds%',
  'an observed window with the wrong night count is refused'
);
select throws_like(
  $$ insert into accommodation_options (
       owner_id, stay_id, label, property_name, rate_amount, rate_unit, nights, currency,
       source_id, observed_on, observed_start_date
     ) values (
       '10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000004', 'bad date', 'Bad Hotel',
       80, 'per_night', 5, 'USD', '13000000-0000-0000-0000-000000000003', '2026-10-01', '2027-07-02'
     ) $$,
  '%accommodation figure must be backed by the nights it funds%',
  'an observed window one day off the stay is refused'
);
select lives_ok(
  $$ insert into accommodation_options (
       owner_id, stay_id, label, property_name, rate_amount, rate_unit, nights, currency,
       source_id, observed_on, observed_start_date
     ) values (
       '10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000004', 'undated', 'Guide Price Hotel',
       80, 'per_night', 5, 'USD', '13000000-0000-0000-0000-000000000003', '2026-10-01', null
     ) $$,
  'no observed_start_date at all (a guide price) is allowed'
);
select lives_ok(
  $$ insert into accommodation_options (
       owner_id, stay_id, label, property_name, rate_amount, rate_unit, nights, currency,
       source_id, observed_on, observed_start_date
     ) values (
       '10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000004', 'year placeholder', 'A-009 Style Hotel',
       80, 'per_night', 5, 'USD', '13000000-0000-0000-0000-000000000003', '2026-10-01', '2026-07-01'
     ) $$,
  'a whole-year shift (A-009''s sanctioned placeholder convention) is allowed'
);
select throws_like(
  $$ update accommodation_options set observed_start_date = '2027-07-02'
     where id = '13000000-0000-0000-0000-000000000005' $$,
  '%accommodation figure must be backed by the nights it funds%',
  'the trigger refuses an update too, not just an insert'
);

-- update_accommodation_option / delete_accommodation_option

select throws_like(
  $$ select update_accommodation_option(
       '13000000-0000-0000-0000-000000000005', 'Renamed', 'Hotel One', null, 100, 'per_night', 5, 0, 'USD',
       'candidate', 'unknown', null, null, false, null, false,
       '13000000-0000-0000-0000-000000000003', '2026-10-01', null, 'estimate', null, ''
     ) $$,
  '%reason is required%',
  'update_accommodation_option rejects a blank reason'
);

select lives_ok(
  $$ select update_accommodation_option(
       '13000000-0000-0000-0000-000000000005', 'Renamed hotel', 'Hotel One Renamed', 'Main St 1', 110, 'per_night', 5, 20, 'USD',
       'selected', 'refundable', '2027-06-01', 'ABC123', false, null, false,
       '13000000-0000-0000-0000-000000000003', '2026-10-01', null, 'estimate', 'pgTAP note', 'pgTAP: updating it'
     ) $$,
  'update_accommodation_option succeeds with a real reason'
);

select results_eq(
  $$ select label, rate_amount, status, booking_reference from accommodation_options where id = '13000000-0000-0000-0000-000000000005' $$,
  $$ values ('Renamed hotel'::text, 110::numeric, 'selected'::accommodation_option_status, 'ABC123'::text) $$,
  'the option was actually updated'
);

select throws_like(
  $$ select delete_accommodation_option('13000000-0000-0000-0000-000000000006', '') $$,
  '%reason is required%',
  'delete_accommodation_option rejects a blank reason'
);
select lives_ok(
  $$ select delete_accommodation_option('13000000-0000-0000-0000-000000000006', 'pgTAP: removing the unused candidate') $$,
  'delete_accommodation_option succeeds with a real reason'
);
select is(
  (select count(*) from accommodation_options where id = '13000000-0000-0000-0000-000000000006')::int, 0,
  'the option is actually gone'
);

-- A second account can't touch any of these RPCs.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_like(
  $$ select update_accommodation_option(
       '13000000-0000-0000-0000-000000000005', 'x', 'x', null, 1, 'per_night', 1, 0, 'USD',
       'candidate', 'unknown', null, null, false, null, false, null, '2026-10-01', null, 'estimate', null, 'not mine'
     ) $$,
  '%not found%',
  'a second account updating my accommodation option gets "not found"'
);
select throws_like(
  $$ select delete_accommodation_option('13000000-0000-0000-0000-000000000005', 'not mine') $$,
  '%not found%',
  'a second account deleting my accommodation option gets "not found"'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- Grants: authenticated can execute both new RPCs, anon can't.
select ok(has_function_privilege('authenticated',
  'update_accommodation_option(uuid, text, text, text, numeric, accommodation_rate_unit, integer, numeric, text, accommodation_option_status, refundability, date, text, boolean, numeric, boolean, uuid, date, date, info_state, text, text)',
  'EXECUTE'), 'authenticated can execute update_accommodation_option');
select ok(not has_function_privilege('anon',
  'update_accommodation_option(uuid, text, text, text, numeric, accommodation_rate_unit, integer, numeric, text, accommodation_option_status, refundability, date, text, boolean, numeric, boolean, uuid, date, date, info_state, text, text)',
  'EXECUTE'), 'anon cannot execute update_accommodation_option');
select ok(has_function_privilege('authenticated', 'delete_accommodation_option(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_accommodation_option');
select ok(not has_function_privilege('anon', 'delete_accommodation_option(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_accommodation_option');

-- Import proposals: create_accommodation_option / update_accommodation_option
-- round-trip through approve_proposal(). The update needs a second
-- batch, pasted after the first is approved -- same reasoning as
-- 0200_flights.test.sql's own two-batch flight fare update.
select lives_ok(
  $$ select create_proposal_batch(
       '13000000-0000-0000-0000-000000000001', 'pgTAP accommodation batch', '{"raw": "as pasted"}',
       '[
         {"position": 0, "ref": "ao1", "op": "create_accommodation_option", "reason": "pgTAP: new candidate rate",
          "payload": {"data": {
            "stay": {"id": "13000000-0000-0000-0000-000000000004"},
            "label": "pgTAP proposed option", "propertyName": "Proposed Hotel",
            "rateAmount": 90, "rateUnit": "per_night", "nights": 5, "mandatoryFees": 10, "currency": "USD",
            "informationState": "estimate",
            "source": {"id": "13000000-0000-0000-0000-000000000003"},
            "observedOn": "2026-10-20", "refundability": "unknown",
            "conditionalRate": false, "isHostel": false
          }}, "dependsOn": []}
       ]'
     ) $$,
  'a batch proposing an accommodation option is saved'
);
select lives_ok(
  $$ select approve_proposal(id) from proposal_items
     where batch_id = (select id from proposal_batches where note = 'pgTAP accommodation batch') and position = 0 $$,
  'approving create_accommodation_option succeeds'
);

select lives_ok(
  $$ select create_proposal_batch(
       '13000000-0000-0000-0000-000000000001', 'pgTAP accommodation rate update', '{"raw": "as pasted"}',
       format(
         '[{"position": 0, "op": "update_accommodation_option", "targetId": "%s", "reason": "pgTAP: a lower rate was found",
            "payload": {"changes": {"rateAmount": {"from": 90, "to": 85}}}, "dependsOn": []}]',
         (select result_id from proposal_items
          where batch_id = (select id from proposal_batches where note = 'pgTAP accommodation batch') and position = 0)
       )::jsonb
     ) $$,
  'a follow-up batch updating the now-real option is saved'
);
select lives_ok(
  $$ select approve_proposal(id) from proposal_items
     where batch_id = (select id from proposal_batches where note = 'pgTAP accommodation rate update') and position = 0 $$,
  'approving update_accommodation_option succeeds'
);

select results_eq(
  $$ select label, rate_amount from accommodation_options where id = (
       select result_id from proposal_items
       where batch_id = (select id from proposal_batches where note = 'pgTAP accommodation batch') and position = 0
     ) $$,
  $$ values ('pgTAP proposed option'::text, 85::numeric) $$,
  'the proposed option and the rate update both actually landed'
);

-- The import path is never a back door around the trigger: the batch
-- layer stores whatever payload it's given, but approving a mismatched
-- one is refused exactly like a direct write would be.
select lives_ok(
  $$ select create_proposal_batch(
       '13000000-0000-0000-0000-000000000001', 'pgTAP accommodation mismatch batch', '{"raw": "as pasted"}',
       '[
         {"position": 0, "op": "create_accommodation_option", "reason": "pgTAP: wrong night observed",
          "payload": {"data": {
            "stay": {"id": "13000000-0000-0000-0000-000000000004"},
            "label": "pgTAP mismatched option", "propertyName": "Wrong Night Hotel",
            "rateAmount": 90, "rateUnit": "per_night", "nights": 5, "mandatoryFees": 10, "currency": "USD",
            "informationState": "estimate",
            "source": {"id": "13000000-0000-0000-0000-000000000003"},
            "observedOn": "2026-10-20", "observedStartDate": "2027-07-02", "refundability": "unknown",
            "conditionalRate": false, "isHostel": false
          }}, "dependsOn": []}
       ]'
     ) $$,
  'a batch proposing a mismatched accommodation option is saved -- the batch layer doesn''t validate payload contents'
);
select throws_like(
  $$ select approve_proposal(id) from proposal_items
     where batch_id = (select id from proposal_batches where note = 'pgTAP accommodation mismatch batch') and position = 0 $$,
  '%accommodation figure must be backed by the nights it funds%',
  'approving it is refused by the same trigger, not silently approved and flagged later'
);

-- Phase 6.11a: moving a stay must re-validate any dated accommodation
-- option already attached to it, and a validation that can't find
-- its stay must refuse outright, not wave the write through. Fresh
-- fixtures, kept separate from the ones above, so these don't inherit
-- any state the earlier assertions left behind.
insert into stays (id, owner_id, scenario_id, location_id, start_date, nights, kind, information_state) values (
  '13000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-00000000000a', '2028-03-01', 4, 'event', 'estimate'
);
insert into accommodation_options (
  id, owner_id, stay_id, label, property_name, rate_amount, rate_unit, nights, currency, source_id, observed_on, observed_start_date
) values (
  '13000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000008', 'pgTAP dated option', 'Dated Hotel', 100, 'per_night', 4, 'USD',
  '13000000-0000-0000-0000-000000000003', '2026-10-01', '2028-03-01'
);

select throws_like(
  $$ update stays set start_date = '2028-03-02' where id = '13000000-0000-0000-0000-000000000008' $$,
  '%pgTAP dated option%',
  'moving a stay off a dated option''s own night is refused, naming the option'
);
select lives_ok(
  $$ update stays set start_date = '2029-03-01' where id = '13000000-0000-0000-0000-000000000008' $$,
  'moving a stay to the same month/day next year keeps a dated option valid, same A-009 tolerance as the option-side check'
);

insert into stays (id, owner_id, scenario_id, location_id, start_date, nights, kind, information_state) values (
  '13000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-00000000000a', '2028-04-01', 4, 'event', 'estimate'
);
insert into accommodation_options (
  id, owner_id, stay_id, label, property_name, rate_amount, rate_unit, nights, currency, source_id, observed_on
) values (
  '13000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-00000000000c', 'pgTAP undated option', 'Guide Price Hotel', 90, 'per_night', 4, 'USD',
  '13000000-0000-0000-0000-000000000003', '2026-10-01'
);

select lives_ok(
  $$ update stays set start_date = '2028-04-15' where id = '13000000-0000-0000-0000-00000000000c' $$,
  'an undated attached option is skipped, not re-validated, so an otherwise-invalidating move still succeeds'
);

select throws_like(
  $$ insert into accommodation_options (
       owner_id, stay_id, label, property_name, rate_amount, rate_unit, nights, currency,
       source_id, observed_on, observed_start_date
     ) values (
       '10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-0000000000ff', 'orphan', 'Unreachable Stay Hotel',
       80, 'per_night', 4, 'USD', '13000000-0000-0000-0000-000000000003', '2026-10-01', '2028-03-01'
     ) $$,
  '%stay could not be found%',
  'a dated option whose stay can''t be found is refused outright, not silently allowed through a failed comparison'
);

select * from finish();
rollback;
