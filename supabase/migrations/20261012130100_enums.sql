-- Every amount, date, or fact in the planning system carries one of these.
-- A value never silently becomes more or less certain: it moves between
-- these named states, and that move is recorded in change_log.
create type info_state as enum (
  'confirmed',
  'estimate',
  'assumption',
  'decision',
  'pending',
  'historical',
  'conflicting'
);

-- Budget category A-J from the planning system. Every expense belongs to
-- exactly one of these, counted once.
create type budget_category as enum (
  'A', -- Competition
  'B', -- International transport
  'C', -- Accommodation
  'D', -- Local/intercity transport
  'E', -- Food
  'F', -- Activities
  'G', -- Connectivity
  'H', -- Insurance
  'I', -- Pre-trip
  'J'  -- Contingency
);

create type payment_timing as enum (
  'paid_now',
  'due_on_date',
  'pay_before_arrival',
  'pay_at_property',
  'unknown',
  'optional'
);

-- Whether a payment obligation is still just planned, has become a real
-- commitment, has actually been paid, or was called off.
create type payment_status as enum (
  'planned',
  'committed',
  'paid',
  'cancelled'
);

create type refundability as enum (
  'refundable',
  'partially_refundable',
  'non_refundable',
  'unknown'
);

create type trip_status as enum (
  'planning',
  'confirmed',
  'completed',
  'cancelled'
);

create type acceptance_status as enum (
  'pending',
  'accepted',
  'declined'
);

create type open_item_category as enum (
  'deadline',
  'task',
  'question'
);

create type open_item_status as enum (
  'open',
  'done',
  'dismissed'
);

create type rate_kind as enum (
  'observed',
  'planning_base',
  'planning_conservative'
);

-- Whether a fare's baggage allowance covers the ~23kg checked suitcase
-- hard constraint.
create type flight_baggage as enum (
  'included',
  'paid_addon',
  'not_allowed',
  'unknown'
);

create type flight_direction as enum (
  'outbound',
  'return'
);

create type change_action as enum (
  'insert',
  'update',
  'delete'
);
