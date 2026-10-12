-- A priced flight option for a scenario. source_id is mandatory even
-- when the fare is just a model estimate (tier 6) -- "never invent a
-- source" applies to flights too. No airport, airline, or hub is ever
-- preferred or ranked here; this table only records what a given
-- option costs and when it lands, never which one is "better".
create table flight_options (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  scenario_id uuid not null references scenarios (id) on delete cascade,
  fare numeric(12, 2) not null,
  bag_fee numeric(12, 2) not null default 0,
  mandatory_fees numeric(12, 2) not null default 0,
  currency text not null,
  information_state info_state not null default 'estimate',
  source_id uuid not null references sources (id),
  observed_on date not null,
  baggage flight_baggage not null default 'unknown',
  separate_tickets boolean not null default false,
  arrival_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flight_options_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint flight_options_confirmed_needs_source
    check (information_state <> 'confirmed' or source_id is not null),
  constraint flight_options_paid_addon_needs_fee
    check (baggage <> 'paid_addon' or bag_fee > 0)
);

create trigger trg_flight_options_set_updated_at
before update on flight_options
for each row execute function trigger_set_updated_at();

alter table flight_options enable row level security;

create policy "owner_all" on flight_options
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- One leg of a flight option. from_country/to_country are ISO-2 codes;
-- the US/Canada/territory check itself is deliberately not enforced here
-- -- Phase 4 adds a tested function (with its own maintained list of
-- territory codes, since Puerto Rico etc. count as US) plus maybe a
-- flagging view. direction lets Phase 4 separately check "outbound
-- arrival before the festival starts" vs "return departure after the
-- festival ends".
create table flight_segments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  flight_option_id uuid not null references flight_options (id) on delete cascade,
  direction flight_direction not null,
  segment_order smallint not null,
  from_airport text not null,
  to_airport text not null,
  from_country text not null,
  to_country text not null,
  flight_number text,
  depart_at timestamptz not null,
  arrive_at timestamptz not null,
  is_technical_stop boolean not null default false,
  created_at timestamptz not null default now(),
  constraint flight_segments_airport_format
    check (from_airport ~ '^[A-Z]{3}$' and to_airport ~ '^[A-Z]{3}$'),
  constraint flight_segments_country_format
    check (from_country ~ '^[A-Z]{2}$' and to_country ~ '^[A-Z]{2}$'),
  constraint flight_segments_arrive_after_depart check (arrive_at >= depart_at),
  constraint flight_segments_order_unique unique (flight_option_id, direction, segment_order)
);

alter table flight_segments enable row level security;

create policy "owner_all" on flight_segments
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
