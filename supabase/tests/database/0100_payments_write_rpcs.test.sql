-- create_payment / record_payment / update_payment_status /
-- update_payment_details / delete_payment
-- (20261015093000_payments_writes.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(32);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('f0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP fixture trip', 'planning');

insert into scenarios (id, owner_id, trip_id, name) values (
  'f0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001', 'pgTAP fixture scenario'
);

-- A pre-existing budget line (not auto_created), to prove create_payment
-- can attach to one instead of always making a new one.
insert into budget_lines (
  id, owner_id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state, auto_created
) values (
  'f0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002',
  'B', 'pgTAP existing line', 200, 200, 200, 'USD', 'estimate', false
);

-- create_payment: auto-creates a budget line when none is given.
select results_eq(
  $$ select bl.auto_created, bl.information_state::text
     from budget_lines bl
     join (select budget_line_id from create_payment(
       'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', null, 'A',
       'pgTAP new-line payment', 'USD', 150, 'refundable', null, 'due_on_date', '2029-01-01', false
     )) np on bl.id = np.budget_line_id $$,
  $$ values (true, 'estimate') $$,
  'create_payment auto-creates a budget line, marked auto_created and never confirmed'
);

select is(
  (select count(*) from budget_lines where trip_id = 'f0000000-0000-0000-0000-000000000001')::int,
  2,
  'exactly one new budget line exists so far (plus the pre-existing one)'
);

-- create_payment: attaches to an existing line instead when given one.
select is(
  (select budget_line_id from create_payment(
    'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002',
    'f0000000-0000-0000-0000-000000000003', null,
    'pgTAP existing-line payment', 'USD', 50, 'refundable', null, 'due_on_date', '2029-01-01', false
  )),
  'f0000000-0000-0000-0000-000000000003',
  'create_payment attaches to the given budget line instead of making a new one'
);

select is(
  (select count(*) from budget_lines where trip_id = 'f0000000-0000-0000-0000-000000000001')::int,
  2,
  'no extra budget line was created for the attach-to-existing payment'
);

select throws_like(
  $$ select create_payment(
       'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', null, null,
       'pgTAP missing category', 'USD', 10, 'refundable', null, 'due_on_date', '2029-01-01', false
     ) $$,
  '%budget category is required%',
  'create_payment requires a category when not attaching to an existing line'
);

-- A payment to exercise record/update/delete against.
insert into payments (id, owner_id, budget_line_id, scenario_id, description, total_amount, currency, refundability, competition_related)
values (
  'f0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000002',
  'pgTAP record/update/delete target', 500, 'USD', 'refundable', false
);

select throws_like(
  $$ select record_payment('f0000000-0000-0000-0000-000000000005', 100, '') $$,
  '%reason is required%',
  'record_payment rejects a blank reason'
);

select is(
  (select paid_amount from payments where id = 'f0000000-0000-0000-0000-000000000005'),
  0::numeric,
  'paid_amount is unchanged after the rejected reason'
);

select lives_ok(
  $$ select record_payment('f0000000-0000-0000-0000-000000000005', 100, 'pgTAP: partial payment') $$,
  'record_payment succeeds with a real reason'
);

select is(
  (select paid_amount from payments where id = 'f0000000-0000-0000-0000-000000000005'),
  100::numeric,
  'paid_amount actually increased'
);

select throws_like(
  $$ select record_payment('f0000000-0000-0000-0000-000000000005', 1000, 'pgTAP: too much') $$,
  '%payments_paid_not_over_total%',
  'record_payment still enforces paid_amount <= total_amount'
);

select throws_like(
  $$ select update_payment_status('f0000000-0000-0000-0000-000000000005', 'committed', '') $$,
  '%reason is required%',
  'update_payment_status rejects a blank reason'
);

select lives_ok(
  $$ select update_payment_status('f0000000-0000-0000-0000-000000000005', 'committed', 'pgTAP: committing it') $$,
  'update_payment_status succeeds with a real reason'
);

select is(
  (select status::text from payments where id = 'f0000000-0000-0000-0000-000000000005'),
  'committed',
  'status actually changed'
);

select throws_like(
  $$ select update_payment_details(
       'f0000000-0000-0000-0000-000000000005', 'renamed', 500, 'USD', '2029-02-01', null,
       'estimate', null, 'due_on_date', 'estimate', null, 'refundable', false, ''
     ) $$,
  '%reason is required%',
  'update_payment_details rejects a blank reason'
);

select lives_ok(
  $$ select update_payment_details(
       'f0000000-0000-0000-0000-000000000005', 'renamed', 500, 'USD', '2029-02-01', null,
       'estimate', null, 'due_on_date', 'estimate', null, 'refundable', false, 'pgTAP: renaming it'
     ) $$,
  'update_payment_details succeeds with a real reason'
);

select is(
  (select description from payments where id = 'f0000000-0000-0000-0000-000000000005'),
  'renamed',
  'the description was actually updated'
);

-- A second account can't touch it either.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_like(
  $$ select update_payment_status('f0000000-0000-0000-0000-000000000005', 'paid', 'not my payment') $$,
  '%not found%',
  'a second account updating my payment''s status gets "not found"'
);

select throws_like(
  $$ select delete_payment('f0000000-0000-0000-0000-000000000005', 'not my payment') $$,
  '%not found%',
  'a second account deleting my payment also gets "not found"'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- delete_payment: the auto-created, now-unreferenced line goes with it;
-- the pre-existing (not auto_created) line never does, even once
-- nothing references it either.
select throws_like(
  $$ select delete_payment('f0000000-0000-0000-0000-000000000005', '') $$,
  '%reason is required%',
  'delete_payment rejects a blank reason'
);

select lives_ok(
  $$ select delete_payment('f0000000-0000-0000-0000-000000000005', 'pgTAP: deleting it') $$,
  'delete_payment succeeds with a real reason'
);

select is(
  (select count(*) from budget_lines where id = 'f0000000-0000-0000-0000-000000000003')::int,
  0,
  'the auto_created budget line was deleted along with its last payment'
);

select is(
  (select count(*) from budget_lines where description = 'pgTAP existing line')::int,
  1,
  'the pre-existing, not-auto_created line was never created above -- sanity: it is a different row'
);

-- Grants: authenticated can call every write RPC, anon can't.
select ok(has_function_privilege('authenticated',
  'create_payment(uuid, uuid, uuid, budget_category, text, text, numeric, refundability, date, payment_timing, date, boolean)', 'EXECUTE'),
  'authenticated can execute create_payment');
select ok(not has_function_privilege('anon',
  'create_payment(uuid, uuid, uuid, budget_category, text, text, numeric, refundability, date, payment_timing, date, boolean)', 'EXECUTE'),
  'anon cannot execute create_payment');
select ok(has_function_privilege('authenticated', 'record_payment(uuid, numeric, text)', 'EXECUTE'),
  'authenticated can execute record_payment');
select ok(not has_function_privilege('anon', 'record_payment(uuid, numeric, text)', 'EXECUTE'),
  'anon cannot execute record_payment');
select ok(has_function_privilege('authenticated', 'update_payment_status(uuid, payment_status, text, uuid)', 'EXECUTE'),
  'authenticated can execute update_payment_status');
select ok(not has_function_privilege('anon', 'update_payment_status(uuid, payment_status, text, uuid)', 'EXECUTE'),
  'anon cannot execute update_payment_status');
select ok(has_function_privilege('authenticated',
  'update_payment_details(uuid, text, numeric, text, date, date, info_state, uuid, payment_timing, info_state, uuid, refundability, boolean, text)', 'EXECUTE'),
  'authenticated can execute update_payment_details');
select ok(not has_function_privilege('anon',
  'update_payment_details(uuid, text, numeric, text, date, date, info_state, uuid, payment_timing, info_state, uuid, refundability, boolean, text)', 'EXECUTE'),
  'anon cannot execute update_payment_details');
select ok(has_function_privilege('authenticated', 'delete_payment(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_payment');
select ok(not has_function_privilege('anon', 'delete_payment(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_payment');

select * from finish();
rollback;
