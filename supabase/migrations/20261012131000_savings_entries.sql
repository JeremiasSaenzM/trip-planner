-- Money actually set aside. This is a plain fact you recorded yourself,
-- not something sourced externally, so no information_state/source_id.
create table savings_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  trip_id uuid not null references trips (id) on delete cascade,
  amount numeric(12, 2) not null,
  currency text not null,
  recorded_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  constraint savings_entries_currency_format check (currency ~ '^[A-Z]{3}$')
);

alter table savings_entries enable row level security;

create policy "owner_all" on savings_entries
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
