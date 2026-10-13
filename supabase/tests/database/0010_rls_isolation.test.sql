-- Proves RLS actually isolates the data: the real user sees their own
-- seeded rows, and a second account -- which owns nothing -- sees zero
-- rows in every single table, even though plenty of rows exist.
begin;
-- pgTAP ships in the Supabase Postgres image but isn't enabled by
-- default. Tests provision it themselves, inside this same transaction,
-- rather than shipping it as a migration -- a migration would also
-- enable it on the hosted database, which never needs it.
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select ok(
  (select count(*) from trips) > 0,
  'sanity check: the real user does see their own seeded trip'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select is((select count(*) from trips)::int, 0, 'second user sees no trips');
select is((select count(*) from sources)::int, 0, 'second user sees no sources');
select is((select count(*) from competitions)::int, 0, 'second user sees no competitions');
select is((select count(*) from scenarios)::int, 0, 'second user sees no scenarios');
select is((select count(*) from decisions)::int, 0, 'second user sees no decisions');
select is((select count(*) from budget_lines)::int, 0, 'second user sees no budget_lines');
select is((select count(*) from payments)::int, 0, 'second user sees no payments');
select is((select count(*) from savings_entries)::int, 0, 'second user sees no savings_entries');
select is((select count(*) from fx_rates)::int, 0, 'second user sees no fx_rates');
select is((select count(*) from open_items)::int, 0, 'second user sees no open_items');
select is((select count(*) from flight_options)::int, 0, 'second user sees no flight_options');
select is((select count(*) from flight_segments)::int, 0, 'second user sees no flight_segments');
select is((select count(*) from change_log)::int, 0, 'second user sees no change_log rows');

select * from finish();
rollback;
