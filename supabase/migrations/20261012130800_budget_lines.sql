create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  trip_id uuid not null references trips (id) on delete cascade,
  scenario_id uuid references scenarios (id),
  category budget_category not null,
  description text not null,
  amount_min numeric(12, 2) not null,
  amount_target numeric(12, 2) not null,
  amount_conservative numeric(12, 2) not null,
  currency text not null,
  information_state info_state not null default 'estimate',
  source_id uuid references sources (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_lines_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint budget_lines_amount_order
    check (amount_min <= amount_target and amount_target <= amount_conservative),
  constraint budget_lines_confirmed_needs_source
    check (information_state <> 'confirmed' or source_id is not null)
);

create trigger trg_budget_lines_set_updated_at
before update on budget_lines
for each row execute function trigger_set_updated_at();

alter table budget_lines enable row level security;

create policy "owner_all" on budget_lines
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
