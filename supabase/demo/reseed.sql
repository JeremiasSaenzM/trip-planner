-- The only script allowed to touch the demo project's data (besides
-- migrations). Checks the _demo_marker table FIRST, before anything
-- else runs -- including before the truncate -- and aborts outright if
-- it's missing. The marker row itself is inserted by hand, once, in
-- the demo project's SQL editor; nothing here, and nothing in CI, ever
-- creates it.
do $$
begin
  if not exists (select 1 from _demo_marker) then
    raise exception 'Refusing to reseed: this database has no _demo_marker row. This script must only ever run against the demo project.';
  end if;
end $$;

truncate table
  change_log,
  flight_segments,
  flight_options,
  open_items,
  fx_rates,
  savings_entries,
  payments,
  budget_lines,
  decisions,
  scenarios,
  competitions,
  sources,
  trips
cascade;

\ir seed.sql
