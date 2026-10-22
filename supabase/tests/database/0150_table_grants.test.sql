-- Data API grants on every table in public
-- (20261020090000_explicit_table_grants.sql).
--
-- A table created without its grants fails here, by name, instead of
-- surfacing later as a "permission denied" somewhere in the e2e suite:
--   * under the new Supabase default (no automatic grants) it fails
--     "every table is readable by authenticated";
--   * under the old one (everything granted to everyone) it fails
--     "no table grants anything to anon";
--   * either way it fails "every table has its grants declared here"
--     until it's added to the list below.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(54);

select set_eq(
  $$ select c.relname::text from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') $$,
  array[
    'trips', 'sources', 'competitions', 'scenarios', 'decisions', 'budget_lines',
    'payments', 'savings_entries', 'fx_rates', 'open_items', 'flight_options',
    'flight_segments', 'change_log', 'proposal_batches', 'proposal_items',
    'stays', 'movements'
  ],
  'every table in public has its expected grants declared in this file'
);

select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
       and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') $$,
  'no table in public grants anything to anon'
);

select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
       and not has_table_privilege('authenticated', c.oid, 'SELECT') $$,
  'every table in public is readable by authenticated'
);

-- Plan data: authenticated and service_role read and write row by row
-- (RLS still scopes authenticated to its own rows); anon gets nothing.

select table_privs_are('public', 'trips', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: trips');
select table_privs_are('public', 'trips', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: trips');
select table_privs_are('public', 'trips', 'anon', array[]::text[], 'anon: nothing on trips');

select table_privs_are('public', 'sources', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: sources');
select table_privs_are('public', 'sources', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: sources');
select table_privs_are('public', 'sources', 'anon', array[]::text[], 'anon: nothing on sources');

select table_privs_are('public', 'competitions', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: competitions');
select table_privs_are('public', 'competitions', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: competitions');
select table_privs_are('public', 'competitions', 'anon', array[]::text[], 'anon: nothing on competitions');

select table_privs_are('public', 'scenarios', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: scenarios');
select table_privs_are('public', 'scenarios', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: scenarios');
select table_privs_are('public', 'scenarios', 'anon', array[]::text[], 'anon: nothing on scenarios');

select table_privs_are('public', 'decisions', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: decisions');
select table_privs_are('public', 'decisions', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: decisions');
select table_privs_are('public', 'decisions', 'anon', array[]::text[], 'anon: nothing on decisions');

select table_privs_are('public', 'budget_lines', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: budget_lines');
select table_privs_are('public', 'budget_lines', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: budget_lines');
select table_privs_are('public', 'budget_lines', 'anon', array[]::text[], 'anon: nothing on budget_lines');

select table_privs_are('public', 'payments', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: payments');
select table_privs_are('public', 'payments', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: payments');
select table_privs_are('public', 'payments', 'anon', array[]::text[], 'anon: nothing on payments');

select table_privs_are('public', 'savings_entries', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: savings_entries');
select table_privs_are('public', 'savings_entries', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: savings_entries');
select table_privs_are('public', 'savings_entries', 'anon', array[]::text[], 'anon: nothing on savings_entries');

select table_privs_are('public', 'fx_rates', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: fx_rates');
select table_privs_are('public', 'fx_rates', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: fx_rates');
select table_privs_are('public', 'fx_rates', 'anon', array[]::text[], 'anon: nothing on fx_rates');

select table_privs_are('public', 'open_items', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: open_items');
select table_privs_are('public', 'open_items', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: open_items');
select table_privs_are('public', 'open_items', 'anon', array[]::text[], 'anon: nothing on open_items');

select table_privs_are('public', 'flight_options', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: flight_options');
select table_privs_are('public', 'flight_options', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: flight_options');
select table_privs_are('public', 'flight_options', 'anon', array[]::text[], 'anon: nothing on flight_options');

select table_privs_are('public', 'flight_segments', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: flight_segments');
select table_privs_are('public', 'flight_segments', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: flight_segments');
select table_privs_are('public', 'flight_segments', 'anon', array[]::text[], 'anon: nothing on flight_segments');

select table_privs_are('public', 'stays', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: stays');
select table_privs_are('public', 'stays', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: stays');
select table_privs_are('public', 'stays', 'anon', array[]::text[], 'anon: nothing on stays');

select table_privs_are('public', 'movements', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: movements');
select table_privs_are('public', 'movements', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: movements');
select table_privs_are('public', 'movements', 'anon', array[]::text[], 'anon: nothing on movements');

-- change_log is append-only and written only by its security definer
-- trigger: read-only for everyone, service_role included.

select table_privs_are('public', 'change_log', 'authenticated', array['SELECT'], 'authenticated: change_log is read-only');
select table_privs_are('public', 'change_log', 'service_role', array['SELECT'], 'service_role: change_log is read-only');
select table_privs_are('public', 'change_log', 'anon', array[]::text[], 'anon: nothing on change_log');

-- Import proposals (20261021090000_import_proposals.sql): pasted, then
-- approved or rejected -- never deleted, and a batch is never edited.

select table_privs_are('public', 'proposal_batches', 'authenticated', array['SELECT', 'INSERT'], 'authenticated: proposal_batches, no update or delete');
select table_privs_are('public', 'proposal_batches', 'service_role', array['SELECT', 'INSERT'], 'service_role: proposal_batches, no update or delete');
select table_privs_are('public', 'proposal_batches', 'anon', array[]::text[], 'anon: nothing on proposal_batches');

select table_privs_are('public', 'proposal_items', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'], 'authenticated: proposal_items, no delete');
select table_privs_are('public', 'proposal_items', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'service_role: proposal_items, no delete');
select table_privs_are('public', 'proposal_items', 'anon', array[]::text[], 'anon: nothing on proposal_items');

select * from finish();
rollback;
