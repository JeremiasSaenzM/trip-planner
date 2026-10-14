-- update_savings_entry / delete_savings_entry (20261014200000_savings_entries_writes.sql):
-- the first RPCs that set app.change_reason themselves rather than
-- relying on the caller to have set it. A plain insert still needs no
-- RPC and no reason -- change_log's trigger doesn't require one for it.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(23);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- A plain insert still writes a change_log row, with no reason needed.
insert into savings_entries (id, owner_id, trip_id, amount, currency, recorded_on, note)
values (
  '90000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 123, 'USD', '2026-10-01', 'pgTAP insert test'
);

select is(
  (select action::text from change_log where table_name = 'savings_entries' and row_id = '90000000-0000-0000-0000-000000000099'),
  'insert',
  'a plain insert writes an insert row to change_log'
);

select is(
  (select (new_data ->> 'amount')::numeric from change_log where table_name = 'savings_entries' and row_id = '90000000-0000-0000-0000-000000000099'),
  123,
  'the logged new_data carries the inserted amount'
);

-- Blank/whitespace reasons are rejected by the RPC itself, before it
-- ever calls set_config -- not left for change_log's trigger alone.
select throws_like(
  $$ select update_savings_entry('90000000-0000-0000-0000-000000000001', 400, '2026-08-01', 'edited', '') $$,
  '%reason is required%',
  'update_savings_entry rejects a blank reason'
);

select throws_like(
  $$ select update_savings_entry('90000000-0000-0000-0000-000000000001', 400, '2026-08-01', 'edited', '   ') $$,
  '%reason is required%',
  'update_savings_entry rejects a whitespace-only reason'
);

select is(
  (select amount from savings_entries where id = '90000000-0000-0000-0000-000000000001'),
  300,
  'the entry is unchanged after both rejected reasons'
);

-- A valid update succeeds and is logged.
select lives_ok(
  $$ select update_savings_entry('90000000-0000-0000-0000-000000000001', 400, '2026-08-15', 'edited via pgTAP', 'pgTAP: proving a valid edit works') $$,
  'update_savings_entry succeeds with a real reason'
);

select is(
  (select amount from savings_entries where id = '90000000-0000-0000-0000-000000000001'),
  400,
  'the amount was actually updated'
);

select is(
  (select recorded_on::text from savings_entries where id = '90000000-0000-0000-0000-000000000001'),
  '2026-08-15',
  'the date was actually updated'
);

select is(
  (select reason from change_log where table_name = 'savings_entries' and row_id = '90000000-0000-0000-0000-000000000001' and action = 'update'),
  'pgTAP: proving a valid edit works',
  'the update was logged with the given reason'
);

-- The DB-level guards hold even when called through the RPC with a
-- perfectly good reason -- these mirror the Zod rules on the app side.
select throws_like(
  $$ select update_savings_entry('90000000-0000-0000-0000-000000000001', 0, '2026-08-15', null, 'trying a zero amount') $$,
  '%savings_entries_amount_positive%',
  'update_savings_entry still enforces amount > 0'
);

select throws_like(
  $$ select update_savings_entry('90000000-0000-0000-0000-000000000001', 400, current_date + 1, null, 'trying a future date') $$,
  '%savings_entries_recorded_on_not_future%',
  'update_savings_entry still enforces recorded_on not in the future'
);

-- A second account -- which owns nothing -- can't touch this row at
-- all: RLS makes "where id = p_id" match zero rows for them, which the
-- RPC reports the same way it would an unknown id.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_like(
  $$ select update_savings_entry('90000000-0000-0000-0000-000000000001', 999, '2026-08-15', null, 'not my entry') $$,
  '%not found%',
  'a second account updating my entry gets "not found", not a silent no-op'
);

select throws_like(
  $$ select delete_savings_entry('90000000-0000-0000-0000-000000000001', 'not my entry') $$,
  '%not found%',
  'a second account deleting my entry also gets "not found"'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is(
  (select amount from savings_entries where id = '90000000-0000-0000-0000-000000000001'),
  400,
  'the entry is unchanged after the other account''s attempts'
);

-- Grants: authenticated can call both RPCs, anon can't.
select ok(
  has_function_privilege('authenticated', 'update_savings_entry(uuid, numeric, date, text, text)', 'EXECUTE'),
  'authenticated can execute update_savings_entry'
);
select ok(
  not has_function_privilege('anon', 'update_savings_entry(uuid, numeric, date, text, text)', 'EXECUTE'),
  'anon cannot execute update_savings_entry'
);
select ok(
  has_function_privilege('authenticated', 'delete_savings_entry(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_savings_entry'
);
select ok(
  not has_function_privilege('anon', 'delete_savings_entry(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_savings_entry'
);

-- Deleting has the same blank-reason guard as updating.
select throws_like(
  $$ select delete_savings_entry('90000000-0000-0000-0000-000000000001', '') $$,
  '%reason is required%',
  'delete_savings_entry rejects a blank reason'
);

select is(
  (select count(*) from savings_entries where id = '90000000-0000-0000-0000-000000000001')::int,
  1,
  'the entry still exists after the rejected delete'
);

select lives_ok(
  $$ select delete_savings_entry('90000000-0000-0000-0000-000000000001', 'pgTAP: proving delete works') $$,
  'delete_savings_entry succeeds with a real reason'
);

select is(
  (select count(*) from savings_entries where id = '90000000-0000-0000-0000-000000000001')::int,
  0,
  'the entry is actually gone'
);

select is(
  (select reason from change_log where table_name = 'savings_entries' and row_id = '90000000-0000-0000-0000-000000000001' and action = 'delete'),
  'pgTAP: proving delete works',
  'the delete was logged with the given reason'
);

select * from finish();
rollback;
