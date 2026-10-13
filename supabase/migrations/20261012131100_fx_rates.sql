-- Historical currency conversions. rate_kind distinguishes an actually
-- observed rate from the rates used for forward planning (base and
-- conservative), so a currency/day can carry up to three rows -- one of
-- each kind. source_id is always required: even a planning rate must
-- cite something, even if that something is a tier-6 model estimate.
create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  currency text not null,
  rate_to_usd numeric(14, 6) not null,
  rate_date date not null,
  rate_kind rate_kind not null,
  information_state info_state not null default 'estimate',
  source_id uuid not null references sources (id),
  constraint fx_rates_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint fx_rates_currency_date_kind_unique unique (currency, rate_date, rate_kind)
);

alter table fx_rates enable row level security;

create policy "owner_all" on fx_rates
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
