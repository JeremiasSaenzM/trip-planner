-- budget_lines.quantity / quantity_unit and the quantity_unit enum
-- (20261025090000_budget_line_quantities.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(19);

-- The enum and the columns

select enum_has_labels('quantity_unit', array['night', 'day', 'person', 'item'],
  'quantity_unit is exactly night / day / person / item, in that order');
select has_column('budget_lines', 'quantity', 'budget_lines has a quantity column');
select has_column('budget_lines', 'quantity_unit', 'budget_lines has a quantity_unit column');
select col_is_null('budget_lines', 'quantity', 'budget_lines.quantity is nullable -- null means a flat amount');
select col_is_null('budget_lines', 'quantity_unit', 'budget_lines.quantity_unit is nullable too');

-- update_budget_line's old 12-argument overload is gone, so no caller
-- can keep editing lines while silently skipping quantity.
select hasnt_function('update_budget_line',
  array['uuid', 'budget_category', 'text', 'numeric', 'numeric', 'numeric', 'text', 'info_state', 'uuid', 'text', 'confidence_level', 'text'],
  'the old update_budget_line signature without p_quantity no longer exists');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('f1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP quantities trip', 'planning');

-- Inserted without a quantity at all: a flat amount, both columns null.
insert into budget_lines (
  id, owner_id, trip_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state
) values (
  'f1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001', 'B', 'pgTAP flat line', 500, 600, 700, 'EUR', 'estimate'
);

select is(
  (select quantity from budget_lines where id = 'f1000000-0000-0000-0000-000000000002'),
  null::numeric,
  'a line inserted without a quantity starts with quantity null'
);
select is(
  (select quantity_unit from budget_lines where id = 'f1000000-0000-0000-0000-000000000002'),
  null::quantity_unit,
  'and quantity_unit null too -- a flat amount'
);

select throws_like(
  $$ insert into budget_lines (
       owner_id, trip_id, category, description,
       amount_min, amount_target, amount_conservative, currency, information_state, quantity, quantity_unit
     ) values (
       '10000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'E', 'pgTAP quantity, no unit',
       1, 1, 1, 'EUR', 'estimate', 13, null
     ) $$,
  '%budget_lines_quantity_pair%',
  'a quantity with no unit is rejected -- the pair is both or neither'
);

select throws_like(
  $$ insert into budget_lines (
       owner_id, trip_id, category, description,
       amount_min, amount_target, amount_conservative, currency, information_state, quantity, quantity_unit
     ) values (
       '10000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'E', 'pgTAP unit, no quantity',
       1, 1, 1, 'EUR', 'estimate', null, 'night'
     ) $$,
  '%budget_lines_quantity_pair%',
  'a unit with no quantity is rejected the same way'
);

select throws_like(
  $$ insert into budget_lines (
       owner_id, trip_id, category, description,
       amount_min, amount_target, amount_conservative, currency, information_state, quantity, quantity_unit
     ) values (
       '10000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'E', 'pgTAP zero quantity',
       1, 1, 1, 'EUR', 'estimate', 0, 'night'
     ) $$,
  '%budget_lines_quantity_positive%',
  'a quantity of zero (or less) is rejected'
);

-- update_budget_line handles quantity/quantity_unit like any other field.

select lives_ok(
  $$ select update_budget_line(
       'f1000000-0000-0000-0000-000000000002', 'C', 'pgTAP Paris nights', 500, 600, 700, 'EUR', 'estimate',
       null, null, null, 13, 'night', 'pgTAP: priced by the night'
     ) $$,
  'update_budget_line sets a quantity and unit together with a real reason'
);

select is(
  (select quantity from budget_lines where id = 'f1000000-0000-0000-0000-000000000002'),
  13::numeric,
  'the quantity was actually set'
);
select is(
  (select quantity_unit from budget_lines where id = 'f1000000-0000-0000-0000-000000000002'),
  'night'::quantity_unit,
  'and the unit alongside it'
);

select results_eq(
  $$ select old_data ->> 'quantity', new_data ->> 'quantity', reason
     from change_log
     where row_id = 'f1000000-0000-0000-0000-000000000002' and action = 'update' $$,
  $$ values (null::text, '13'::text, 'pgTAP: priced by the night'::text) $$,
  'change_log records the quantity change, before and after, with its reason'
);

select throws_like(
  $$ select update_budget_line(
       'f1000000-0000-0000-0000-000000000002', 'C', 'pgTAP Paris nights', 500, 600, 700, 'EUR', 'estimate',
       null, null, null, 13, null, 'pgTAP: trying to break the pair'
     ) $$,
  '%budget_lines_quantity_pair%',
  'update_budget_line enforces the same pair constraint as insert'
);

select lives_ok(
  $$ select update_budget_line(
       'f1000000-0000-0000-0000-000000000002', 'C', 'pgTAP Paris nights', 500, 600, 700, 'EUR', 'estimate',
       null, null, null, null, null, 'pgTAP: back to a flat amount'
     ) $$,
  'update_budget_line can clear the pair back to a flat amount'
);

select is(
  (select quantity from budget_lines where id = 'f1000000-0000-0000-0000-000000000002'),
  null::numeric,
  'the quantity was cleared to null'
);
select is(
  (select quantity_unit from budget_lines where id = 'f1000000-0000-0000-0000-000000000002'),
  null::quantity_unit,
  'and the unit cleared alongside it'
);

select * from finish();
rollback;
