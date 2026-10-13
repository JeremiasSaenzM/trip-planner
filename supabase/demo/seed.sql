-- Demo data, run only against the demo project (see reseed.sql, which
-- checks for this before including this file at all). Fake numbers and
-- providers, same as supabase/seed.sql -- the only difference is that
-- this file never creates an auth user or hardcodes an email: it looks
-- up the one real demo user by email instead, via a psql variable
-- (-v demo_owner_email=... when this is invoked), and never a literal.
--
-- The owner email is passed into the session with set_config() (plain
-- SQL, not a dollar-quoted block), then read back with current_setting()
-- wherever it's needed. psql's :'var' substitution is purely lexical: it
-- does not look inside dollar-quoted (do $$ ... $$) bodies, so a check
-- written as `if :'owner_id' = ''` inside a do block is never substituted
-- and can never work. Looking the owner id up in SQL, into a temp table,
-- sidesteps that entirely -- and also means a non-matching email leaves
-- the temp table empty rather than silently defining :'owner_id' as ''.
select set_config('demo.owner_email', :'demo_owner_email', false);

create temporary table _demo_owner on commit drop as
select id as owner_id from auth.users where email = current_setting('demo.owner_email');

do $$
begin
  if not exists (select 1 from _demo_owner) then
    raise exception 'No auth user found for demo_owner_email %. Create that user in the demo project first (Authentication -> Users -> Add user).', current_setting('demo.owner_email');
  end if;
end $$;

set app.actor = 'seed';

insert into trips (id, owner_id, name, status) values
  ('20000000-0000-0000-0000-000000000001', (select owner_id from _demo_owner),
   'Fictional 2027 choir trip', 'planning');

insert into sources (id, owner_id, provider, tier, url, observed_on, notes) values
  ('30000000-0000-0000-0000-000000000001', (select owner_id from _demo_owner),
   'Fictional Festival — official site', 1, 'https://example.invalid/festival', '2026-09-20', null),
  ('30000000-0000-0000-0000-000000000002', (select owner_id from _demo_owner),
   'Fictional Airline — booking engine', 2, 'https://example.invalid/booking', '2026-10-01', null),
  ('30000000-0000-0000-0000-000000000003', (select owner_id from _demo_owner),
   'Fictional flight aggregator', 3, 'https://example.invalid/aggregator', '2026-10-05', null),
  ('30000000-0000-0000-0000-000000000004', (select owner_id from _demo_owner),
   'Fictional travel blog', 4, 'https://example.invalid/blog', '2026-09-15', null),
  ('30000000-0000-0000-0000-000000000005', (select owner_id from _demo_owner),
   'Fictional choir forum post', 5, 'https://example.invalid/forum', '2026-09-10', null),
  ('30000000-0000-0000-0000-000000000006', (select owner_id from _demo_owner),
   'Model estimate (fictional)', 6, null, '2026-10-01', 'Used only for planning-stage FX and fares.');

insert into competitions (
  id, owner_id, trip_id, name, city, country, venue,
  start_date, end_date, timezone, dates_state, dates_source_id,
  acceptance_status, acceptance_decided_on, acceptance_source_id, is_selected
) values
  ('40000000-0000-0000-0000-000000000001', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001',
   'Fictional International Choir Festival (Candidate B)', 'Verenna', 'Italy', null,
   '2028-07-01', '2028-07-07', 'Europe/Rome', 'estimate', null,
   'pending', null, null, false),
  ('40000000-0000-0000-0000-000000000002', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001',
   'Fictional International Choir Festival (Candidate A)', 'Fontvieux', 'France', 'Fictional Grand Hall',
   '2027-07-05', '2027-07-11', 'Europe/Paris', 'confirmed', '30000000-0000-0000-0000-000000000001',
   'accepted', '2026-09-01', '30000000-0000-0000-0000-000000000001', true);

insert into scenarios (id, owner_id, trip_id, name, competition_id, includes_extension, notes) values
  ('50000000-0000-0000-0000-000000000001', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', 'Candidate A — direct trip',
   '40000000-0000-0000-0000-000000000002', false, null),
  ('50000000-0000-0000-0000-000000000002', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', 'Candidate A — with extension',
   '40000000-0000-0000-0000-000000000002', true, 'Fictional example: a few extra days in Paris after the festival.');

insert into decisions (
  id, owner_id, trip_id, competition_id, title, rationale,
  decided_on, decided_by, reversible, source_id
) values
  ('60000000-0000-0000-0000-000000000001', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'Accepted risk: deposit paid for Candidate B before acceptance',
   'Fictional example: holding a rehearsal-space deposit for the still-pending candidate.',
   '2026-10-01', 'traveler', false, null);

insert into budget_lines (
  id, owner_id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency,
  information_state, source_id
) values
  ('70000000-0000-0000-0000-000000000001', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'A', 'Competition registration fee', 150, 180, 220, 'EUR',
   'confirmed', '30000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'B', 'Round-trip flight', 600, 750, 950, 'EUR',
   'estimate', null),
  ('70000000-0000-0000-0000-000000000003', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'C', 'Hotel near the venue', 400, 500, 650, 'EUR',
   'estimate', null),
  ('70000000-0000-0000-0000-000000000004', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', null,
   'D', 'Local transit and airport transfers', 50, 80, 120, 'EUR',
   'assumption', null),
  ('70000000-0000-0000-0000-000000000005', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', null,
   'E', 'Food for the trip', 150, 200, 280, 'EUR',
   'assumption', null),
  ('70000000-0000-0000-0000-000000000006', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
   'F', 'Extension sightseeing in Paris', 30, 50, 80, 'EUR',
   'estimate', null),
  ('70000000-0000-0000-0000-000000000007', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', null,
   'G', 'Local SIM / eSIM', 20, 25, 30, 'EUR',
   'confirmed', '30000000-0000-0000-0000-000000000003'),
  ('70000000-0000-0000-0000-000000000008', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', null,
   'H', 'Travel insurance', 40, 45, 50, 'EUR',
   'confirmed', '30000000-0000-0000-0000-000000000002'),
  ('70000000-0000-0000-0000-000000000009', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', null,
   'I', 'Pre-trip gear and documents', 60, 80, 100, 'EUR',
   'assumption', null),
  ('70000000-0000-0000-0000-000000000010', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', null,
   'J', 'Contingency buffer', 100, 150, 250, 'EUR',
   'assumption', null);

-- Payments only ever attach to Candidate A (the accepted competition),
-- so none of these can trip the acceptance safeguard.
insert into payments (
  id, owner_id, budget_line_id, scenario_id, description,
  total_amount, paid_amount, currency, due_date, cancellation_deadline,
  dates_state, dates_source_id, timing_type, status, information_state,
  source_id, refundability, competition_related
) values
  ('80000000-0000-0000-0000-000000000001', (select owner_id from _demo_owner),
   '70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'Registration fee payment', 220, 220, 'EUR', null, null,
   'pending', null, 'paid_now', 'paid', 'confirmed',
   '30000000-0000-0000-0000-000000000001', 'non_refundable', true),
  ('80000000-0000-0000-0000-000000000002', (select owner_id from _demo_owner),
   '70000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001',
   'Flight booking', 750, 0, 'EUR', '2027-05-01', null,
   'estimate', null, 'due_on_date', 'committed', 'estimate',
   null, 'partially_refundable', true),
  ('80000000-0000-0000-0000-000000000003', (select owner_id from _demo_owner),
   '70000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001',
   'Hotel deposit', 500, 100, 'EUR', '2027-06-01', '2027-05-15',
   'confirmed', '30000000-0000-0000-0000-000000000002', 'pay_before_arrival', 'committed', 'confirmed',
   '30000000-0000-0000-0000-000000000002', 'refundable', false),
  ('80000000-0000-0000-0000-000000000004', (select owner_id from _demo_owner),
   '70000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000001',
   'Insurance premium', 45, 0, 'EUR', null, null,
   'pending', null, 'optional', 'planned', 'estimate',
   null, 'unknown', false);

insert into savings_entries (id, owner_id, trip_id, amount, currency, recorded_on, note) values
  ('90000000-0000-0000-0000-000000000001', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', 300, 'EUR', '2026-08-01', 'Fictional initial savings'),
  ('90000000-0000-0000-0000-000000000002', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', 250, 'EUR', '2026-09-01', 'Fictional monthly savings');

insert into fx_rates (id, owner_id, currency, rate_to_usd, rate_date, rate_kind, information_state, source_id) values
  ('a0000000-0000-0000-0000-000000000001', (select owner_id from _demo_owner),
   'EUR', 1.080000, '2026-10-01', 'observed', 'confirmed', '30000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000002', (select owner_id from _demo_owner),
   'EUR', 1.100000, '2026-10-01', 'planning_base', 'estimate', '30000000-0000-0000-0000-000000000006'),
  ('a0000000-0000-0000-0000-000000000003', (select owner_id from _demo_owner),
   'EUR', 1.150000, '2026-10-01', 'planning_conservative', 'assumption', '30000000-0000-0000-0000-000000000006');

insert into open_items (
  id, owner_id, trip_id, competition_id, title, description,
  due_date, dates_state, dates_source_id, category, status,
  related_budget_line_id, related_payment_id
) values
  ('b0000000-0000-0000-0000-000000000001', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
   'Pay hotel deposit', 'Fictional example deadline.',
   '2027-05-15', 'confirmed', '30000000-0000-0000-0000-000000000002', 'deadline', 'open',
   '70000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000002', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', null,
   'Research travel insurance options', null,
   null, 'pending', null, 'task', 'open',
   null, null),
  ('b0000000-0000-0000-0000-000000000003', (select owner_id from _demo_owner),
   '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'Will Candidate B confirm festival dates?', 'Fictional example open question.',
   '2026-11-30', 'estimate', null, 'question', 'open',
   null, null);

-- Two flight options: a clean route, and one with a US connection -- a
-- small taste of the hard-constraint-1 check once Phase 4 ships. The
-- full five-option edge-case set lives only in supabase/seed.sql, for
-- the automated test suite, not the demo.
insert into flight_options (
  id, owner_id, scenario_id, fare, bag_fee, mandatory_fees, currency,
  information_state, source_id, observed_on, baggage, separate_tickets, arrival_at
) values
  ('c0000000-0000-0000-0000-000000000001', (select owner_id from _demo_owner),
   '50000000-0000-0000-0000-000000000001', 480, 0, 35, 'EUR',
   'estimate', '30000000-0000-0000-0000-000000000003', '2026-10-05', 'included', false,
   '2027-07-04 22:30:00+02'),
  ('c0000000-0000-0000-0000-000000000002', (select owner_id from _demo_owner),
   '50000000-0000-0000-0000-000000000001', 420, 60, 40, 'EUR',
   'estimate', '30000000-0000-0000-0000-000000000003', '2026-10-05', 'paid_addon', false,
   '2027-07-05 02:30:00+02');

-- fo1: clean route, no US stop
insert into flight_segments (owner_id, flight_option_id, direction, segment_order, from_airport, to_airport, from_country, to_country, flight_number, depart_at, arrive_at, is_technical_stop) values
  ((select owner_id from _demo_owner), 'c0000000-0000-0000-0000-000000000001', 'outbound', 1, 'MAD', 'DOH', 'ES', 'QA', 'FX101', '2027-07-04 09:00:00+02', '2027-07-04 15:00:00+03', false),
  ((select owner_id from _demo_owner), 'c0000000-0000-0000-0000-000000000001', 'outbound', 2, 'DOH', 'CDG', 'QA', 'FR', 'FX102', '2027-07-04 17:00:00+03', '2027-07-04 22:30:00+02', false),
  ((select owner_id from _demo_owner), 'c0000000-0000-0000-0000-000000000001', 'return', 1, 'CDG', 'DOH', 'FR', 'QA', 'FX103', '2027-07-12 10:00:00+02', '2027-07-12 20:00:00+03', false),
  ((select owner_id from _demo_owner), 'c0000000-0000-0000-0000-000000000001', 'return', 2, 'DOH', 'MAD', 'QA', 'ES', 'FX104', '2027-07-12 22:00:00+03', '2027-07-13 03:30:00+02', false);

-- fo2: connection in the US
insert into flight_segments (owner_id, flight_option_id, direction, segment_order, from_airport, to_airport, from_country, to_country, flight_number, depart_at, arrive_at, is_technical_stop) values
  ((select owner_id from _demo_owner), 'c0000000-0000-0000-0000-000000000002', 'outbound', 1, 'MAD', 'JFK', 'ES', 'US', 'FX201', '2027-07-04 10:00:00+02', '2027-07-04 13:00:00-04', false),
  ((select owner_id from _demo_owner), 'c0000000-0000-0000-0000-000000000002', 'outbound', 2, 'JFK', 'CDG', 'US', 'FR', 'FX202', '2027-07-04 13:30:00-04', '2027-07-05 02:30:00+02', false),
  ((select owner_id from _demo_owner), 'c0000000-0000-0000-0000-000000000002', 'return', 1, 'CDG', 'JFK', 'FR', 'US', 'FX203', '2027-07-12 11:00:00+02', '2027-07-12 13:30:00-04', false),
  ((select owner_id from _demo_owner), 'c0000000-0000-0000-0000-000000000002', 'return', 2, 'JFK', 'MAD', 'US', 'ES', 'FX204', '2027-07-12 22:00:00-04', '2027-07-13 11:30:00+02', false);
