-- Fake demo data only. No resemblance to the real trip's real numbers,
-- dates, or providers -- see CLAUDE.md's privacy rule.
--
-- Session-scoped (not transaction-local) so it survives every statement
-- below, since supabase db reset runs this file one autocommitted
-- statement at a time.
set app.actor = 'seed';

-- Two Supabase auth users: the one real "me" account this whole app is
-- built for, and a second account that owns nothing. The second one
-- exists purely so the RLS tests can prove that someone who isn't you
-- sees zero rows anywhere, even though real rows exist.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'owner@example.invalid', '',
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'second.user@example.invalid', '',
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), '', '', '', '');

-- Everything below belongs to the first user. owner_id defaults to
-- auth.uid(), which is null in this seeding session (there is no JWT),
-- so every insert sets owner_id explicitly.

insert into trips (id, owner_id, name, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Fictional 2027 choir trip', 'planning');

insert into sources (id, owner_id, provider, tier, url, observed_on, notes) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Fictional Festival — official site', 1, 'https://example.invalid/festival', '2026-09-20', null),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   'Fictional Airline — booking engine', 2, 'https://example.invalid/booking', '2026-10-01', null),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   'Fictional flight aggregator', 3, 'https://example.invalid/aggregator', '2026-10-05', null),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   'Fictional travel blog', 4, 'https://example.invalid/blog', '2026-09-15', null),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
   'Fictional choir forum post', 5, 'https://example.invalid/forum', '2026-09-10', null),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
   'Model estimate (fictional)', 6, null, '2026-10-01', 'Used only for planning-stage FX and fares.');

-- One candidate with dates still just an estimate, one with the official
-- festival dates confirmed and the choir already accepted.
insert into competitions (
  id, owner_id, trip_id, name, city, country, venue,
  start_date, end_date, timezone, dates_state, dates_source_id,
  acceptance_status, acceptance_decided_on, acceptance_source_id, is_selected
) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'Fictional International Choir Festival (Candidate B)', 'Verenna', 'Italy', null,
   '2028-07-01', '2028-07-07', 'Europe/Rome', 'estimate', null,
   'pending', null, null, false),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'Fictional International Choir Festival (Candidate A)', 'Fontvieux', 'France', 'Fictional Grand Hall',
   '2027-07-05', '2027-07-11', 'Europe/Paris', 'confirmed', '30000000-0000-0000-0000-000000000001',
   'accepted', '2026-09-01', '30000000-0000-0000-0000-000000000001', true);

insert into scenarios (id, owner_id, trip_id, name, competition_id, includes_extension, notes) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Candidate A — direct trip',
   '40000000-0000-0000-0000-000000000002', false, null),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Candidate A — with extension',
   '40000000-0000-0000-0000-000000000002', true, 'Fictional example: a few extra days in Paris after the festival.');

insert into decisions (
  id, owner_id, trip_id, competition_id, title, rationale,
  decided_on, decided_by, reversible, source_id
) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'Accepted risk: deposit paid for Candidate B before acceptance',
   'Fictional example: holding a rehearsal-space deposit for the still-pending candidate.',
   '2026-10-01', 'traveler', false, null);

-- One budget line per category A-J, mixing information states so the
-- "confirmed needs a source" rule is visibly exercised.
insert into budget_lines (
  id, owner_id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency,
  information_state, source_id
) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'A', 'Competition registration fee', 150, 180, 220, 'EUR',
   'confirmed', '30000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'B', 'Round-trip flight', 600, 750, 950, 'EUR',
   'estimate', null),
  ('70000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'C', 'Hotel near the venue', 400, 500, 650, 'EUR',
   'estimate', null),
  ('70000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', null,
   'D', 'Local transit and airport transfers', 50, 80, 120, 'EUR',
   'assumption', null),
  ('70000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', null,
   'E', 'Food for the trip', 150, 200, 280, 'EUR',
   'assumption', null),
  ('70000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
   'F', 'Extension sightseeing in Paris', 30, 50, 80, 'EUR',
   'estimate', null),
  ('70000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', null,
   'G', 'Local SIM / eSIM', 20, 25, 30, 'EUR',
   'confirmed', '30000000-0000-0000-0000-000000000003'),
  ('70000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', null,
   'H', 'Travel insurance', 40, 45, 50, 'EUR',
   'confirmed', '30000000-0000-0000-0000-000000000002'),
  ('70000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', null,
   'I', 'Pre-trip gear and documents', 60, 80, 100, 'EUR',
   'assumption', null),
  ('70000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', null,
   'J', 'Contingency buffer', 100, 150, 250, 'EUR',
   'assumption', null);

-- Payments only ever attach to Candidate A (the accepted competition),
-- so none of these can trip the acceptance safeguard regardless of
-- status or refundability.
insert into payments (
  id, owner_id, budget_line_id, scenario_id, description,
  total_amount, paid_amount, currency, due_date, cancellation_deadline,
  dates_state, dates_source_id, timing_type, status, information_state,
  source_id, refundability, competition_related
) values
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'Registration fee payment', 220, 220, 'EUR', null, null,
   'pending', null, 'paid_now', 'paid', 'confirmed',
   '30000000-0000-0000-0000-000000000001', 'non_refundable', true),
  ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '70000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001',
   'Flight booking', 750, 0, 'EUR', '2027-05-01', null,
   'estimate', null, 'due_on_date', 'committed', 'estimate',
   null, 'partially_refundable', true),
  ('80000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   '70000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001',
   'Hotel deposit', 500, 100, 'EUR', '2027-06-01', '2027-05-15',
   'confirmed', '30000000-0000-0000-0000-000000000002', 'pay_before_arrival', 'committed', 'confirmed',
   '30000000-0000-0000-0000-000000000002', 'refundable', false),
  ('80000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   '70000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000001',
   'Insurance premium', 45, 0, 'EUR', null, null,
   'pending', null, 'optional', 'planned', 'estimate',
   null, 'unknown', false);

insert into savings_entries (id, owner_id, trip_id, amount, currency, recorded_on, note) values
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 300, 'EUR', '2026-08-01', 'Fictional initial savings'),
  ('90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 250, 'EUR', '2026-09-01', 'Fictional monthly savings');

insert into fx_rates (id, owner_id, currency, rate_to_usd, rate_date, rate_kind, information_state, source_id) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'EUR', 1.080000, '2026-10-01', 'observed', 'confirmed', '30000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   'EUR', 1.100000, '2026-10-01', 'planning_base', 'estimate', '30000000-0000-0000-0000-000000000006'),
  ('a0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   'EUR', 1.150000, '2026-10-01', 'planning_conservative', 'assumption', '30000000-0000-0000-0000-000000000006');

insert into open_items (
  id, owner_id, trip_id, competition_id, title, description,
  due_date, dates_state, dates_source_id, category, status,
  related_budget_line_id, related_payment_id
) values
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
   'Pay hotel deposit', 'Fictional example deadline.',
   '2027-05-15', 'confirmed', '30000000-0000-0000-0000-000000000002', 'deadline', 'open',
   '70000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', null,
   'Research travel insurance options', null,
   null, 'pending', null, 'task', 'open',
   null, null),
  ('b0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'Will Candidate B confirm festival dates?', 'Fictional example open question.',
   '2026-11-30', 'estimate', null, 'question', 'open',
   null, null);

-- Five flight options under the direct-trip scenario, each exercising a
-- different case Phase 4's rule functions will need to handle: a clean
-- non-US route, a US connection, a Puerto Rico stop (counts as US),
-- an option landing during day 1 of the festival instead of before it,
-- and a fare with no checked bag allowed at all.
insert into flight_options (
  id, owner_id, scenario_id, label, fare, bag_fee, mandatory_fees, currency,
  information_state, source_id, observed_on, baggage, separate_tickets, refundability, competition_related
) values
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001', 'Clean route via Doha', 480, 0, 35, 'EUR',
   'estimate', '30000000-0000-0000-0000-000000000003', '2026-10-05', 'included', false,
   'non_refundable', true),
  ('c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001', 'Via JFK (fails check 1)', 420, 60, 40, 'EUR',
   'estimate', '30000000-0000-0000-0000-000000000003', '2026-10-05', 'paid_addon', false,
   'unknown', true),
  ('c0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001', 'Via San Juan (fails check 1, US territory)', 410, 0, 38, 'EUR',
   'estimate', '30000000-0000-0000-0000-000000000003', '2026-10-06', 'included', false,
   'unknown', true),
  ('c0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001', 'Direct, lands during day 1 of the festival', 500, 0, 35, 'EUR',
   'estimate', '30000000-0000-0000-0000-000000000002', '2026-10-07', 'included', false,
   'refundable', true),
  ('c0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001', 'Direct, no checked bag allowed', 300, 0, 25, 'EUR',
   'estimate', '30000000-0000-0000-0000-000000000003', '2026-10-08', 'not_allowed', false,
   'non_refundable', true);

-- fo1: clean route, no US stop
insert into flight_segments (owner_id, flight_option_id, direction, segment_order, from_airport, to_airport, from_country, to_country, flight_number, depart_at, arrive_at, is_technical_stop) values
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'outbound', 1, 'MAD', 'DOH', 'ES', 'QA', 'FX101', '2027-07-04 09:00:00+02', '2027-07-04 15:00:00+03', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'outbound', 2, 'DOH', 'CDG', 'QA', 'FR', 'FX102', '2027-07-04 17:00:00+03', '2027-07-04 22:30:00+02', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'return', 1, 'CDG', 'DOH', 'FR', 'QA', 'FX103', '2027-07-12 10:00:00+02', '2027-07-12 20:00:00+03', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'return', 2, 'DOH', 'MAD', 'QA', 'ES', 'FX104', '2027-07-12 22:00:00+03', '2027-07-13 03:30:00+02', false);

-- fo2: connection in the US
insert into flight_segments (owner_id, flight_option_id, direction, segment_order, from_airport, to_airport, from_country, to_country, flight_number, depart_at, arrive_at, is_technical_stop) values
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'outbound', 1, 'MAD', 'JFK', 'ES', 'US', 'FX201', '2027-07-04 10:00:00+02', '2027-07-04 13:00:00-04', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'outbound', 2, 'JFK', 'CDG', 'US', 'FR', 'FX202', '2027-07-04 13:30:00-04', '2027-07-05 02:30:00+02', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'return', 1, 'CDG', 'JFK', 'FR', 'US', 'FX203', '2027-07-12 11:00:00+02', '2027-07-12 13:30:00-04', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'return', 2, 'JFK', 'MAD', 'US', 'ES', 'FX204', '2027-07-12 22:00:00-04', '2027-07-13 11:30:00+02', false);

-- fo3: stop in Puerto Rico (a US territory -- counts as US for hard constraint 1)
insert into flight_segments (owner_id, flight_option_id, direction, segment_order, from_airport, to_airport, from_country, to_country, flight_number, depart_at, arrive_at, is_technical_stop) values
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'outbound', 1, 'MAD', 'SJU', 'ES', 'PR', 'FX301', '2027-07-04 11:00:00+02', '2027-07-04 15:30:00-04', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'outbound', 2, 'SJU', 'CDG', 'PR', 'FR', 'FX302', '2027-07-04 22:00:00-04', '2027-07-05 08:00:00+02', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'return', 1, 'CDG', 'SJU', 'FR', 'PR', 'FX303', '2027-07-12 12:00:00+02', '2027-07-12 17:00:00-04', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'return', 2, 'SJU', 'MAD', 'PR', 'ES', 'FX304', '2027-07-12 23:00:00-04', '2027-07-13 12:00:00+02', false);

-- fo4: direct route, but arrives during day 1 of the festival instead of before it
insert into flight_segments (owner_id, flight_option_id, direction, segment_order, from_airport, to_airport, from_country, to_country, flight_number, depart_at, arrive_at, is_technical_stop) values
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'outbound', 1, 'MAD', 'CDG', 'ES', 'FR', 'FX401', '2027-07-05 07:30:00+02', '2027-07-05 10:00:00+02', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'return', 1, 'CDG', 'MAD', 'FR', 'ES', 'FX402', '2027-07-12 18:00:00+02', '2027-07-12 20:30:00+02', false);

-- fo5: direct route, no checked bag allowed at all
insert into flight_segments (owner_id, flight_option_id, direction, segment_order, from_airport, to_airport, from_country, to_country, flight_number, depart_at, arrive_at, is_technical_stop) values
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005', 'outbound', 1, 'MAD', 'CDG', 'ES', 'FR', 'FX501', '2027-07-04 17:30:00+02', '2027-07-04 20:00:00+02', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005', 'return', 1, 'CDG', 'MAD', 'FR', 'ES', 'FX502', '2027-07-12 19:00:00+02', '2027-07-12 21:30:00+02', false);

-- Candidate A's itinerary: one festival stay in Fontvieux (matching the
-- accepted festival dates, 2027-07-05 to 2027-07-11) and the two legs
-- of flightOptions[0]'s clean route either side of it. The return leg
-- is an overnight flight (departs 07-12, lands 07-13) -- the night of
-- 07-12 needs no stay, a live example of check 4 not requiring a bed
-- for a night spent in the air. The return leg is deliberately left
-- without a budget line, to show that warning too.
insert into stays (id, owner_id, scenario_id, location, start_date, nights, kind, budget_line_id, information_state) values
  ('f2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001', 'Fontvieux', '2027-07-04', 8, 'festival',
   '70000000-0000-0000-0000-000000000003', 'estimate');

insert into movements (
  id, owner_id, scenario_id, sequence, from_location, to_location,
  depart_date, depart_time, arrive_date, arrive_time, mode, budget_line_id, information_state, notes, flight_option_id
) values
  ('f3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001', 1, 'Madrid', 'Fontvieux',
   '2027-07-04', '09:00:00', '2027-07-04', '22:30:00', 'plane',
   '70000000-0000-0000-0000-000000000002', 'estimate', null, 'c0000000-0000-0000-0000-000000000001'),
  ('f3000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001', 2, 'Fontvieux', 'Madrid',
   '2027-07-12', '10:00:00', '2027-07-13', '03:30:00', 'plane',
   null, 'estimate', 'Return leg not yet priced separately.', 'c0000000-0000-0000-0000-000000000001');
