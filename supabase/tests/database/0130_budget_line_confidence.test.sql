-- budget_lines.confidence and the confidence_level enum
-- (20261016090000_budget_line_confidence.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);

-- The enum and the column

select enum_has_labels('confidence_level', array['low', 'medium', 'high'],
  'confidence_level is exactly low / medium / high, in that order');
select has_column('budget_lines', 'confidence', 'budget_lines has a confidence column');
select col_type_is('budget_lines', 'confidence', 'confidence_level', 'budget_lines.confidence is a confidence_level');
select col_is_null('budget_lines', 'confidence', 'budget_lines.confidence is nullable (a line may not be assessed yet)');
select col_hasnt_default('budget_lines', 'confidence', 'budget_lines.confidence has no default -- unassessed stays null');

-- update_budget_line's old 11-argument overload is gone, so no caller
-- can keep editing lines while silently skipping confidence.
select hasnt_function('update_budget_line',
  array['uuid', 'budget_category', 'text', 'numeric', 'numeric', 'numeric', 'text', 'info_state', 'uuid', 'text', 'text'],
  'the old update_budget_line signature without p_confidence no longer exists');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('f0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP confidence trip', 'planning');

-- Inserted without a confidence at all: lands as null ("not assessed").
insert into budget_lines (
  id, owner_id, trip_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state
) values (
  'f0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001', 'C', 'pgTAP confidence line', 100, 120, 150, 'EUR', 'estimate'
);

select is(
  (select confidence from budget_lines where id = 'f0000000-0000-0000-0000-000000000002'),
  null::confidence_level,
  'a line inserted without a confidence starts as null'
);

select throws_like(
  $$ insert into budget_lines (
       owner_id, trip_id, category, description,
       amount_min, amount_target, amount_conservative, currency, information_state, confidence
     ) values (
       '10000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'C', 'pgTAP bad confidence',
       1, 1, 1, 'EUR', 'estimate', 'very high'
     ) $$,
  '%invalid input value for enum confidence_level%',
  'a confidence outside low / medium / high is rejected'
);

-- update_budget_line handles confidence like any other field.

select throws_like(
  $$ select update_budget_line(
       'f0000000-0000-0000-0000-000000000002', 'C', 'pgTAP confidence line', 100, 120, 150, 'EUR', 'estimate',
       null, null, 'medium', ''
     ) $$,
  '%reason is required%',
  'changing confidence still needs a reason'
);

select lives_ok(
  $$ select update_budget_line(
       'f0000000-0000-0000-0000-000000000002', 'C', 'pgTAP confidence line', 100, 120, 150, 'EUR', 'estimate',
       null, null, 'medium', 'pgTAP: several current observations'
     ) $$,
  'update_budget_line sets confidence with a real reason'
);

select is(
  (select confidence from budget_lines where id = 'f0000000-0000-0000-0000-000000000002'),
  'medium'::confidence_level,
  'the confidence was actually set'
);

select results_eq(
  $$ select old_data ->> 'confidence', new_data ->> 'confidence', reason
     from change_log
     where row_id = 'f0000000-0000-0000-0000-000000000002' and action = 'update' $$,
  $$ values (null::text, 'medium'::text, 'pgTAP: several current observations'::text) $$,
  'change_log records the confidence change, before and after, with its reason'
);

select lives_ok(
  $$ select update_budget_line(
       'f0000000-0000-0000-0000-000000000002', 'C', 'pgTAP confidence line', 100, 120, 150, 'EUR', 'estimate',
       null, null, null, 'pgTAP: back to not assessed'
     ) $$,
  'update_budget_line can clear confidence back to not assessed'
);

select is(
  (select confidence from budget_lines where id = 'f0000000-0000-0000-0000-000000000002'),
  null::confidence_level,
  'the confidence was cleared to null'
);

select * from finish();
rollback;
