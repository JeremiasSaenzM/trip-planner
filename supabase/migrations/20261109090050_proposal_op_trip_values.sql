-- Adds the two operations trips need to the import path. Split into its
-- own migration, same reasoning as 20261024090000_proposal_ops_stays_movements.sql:
-- Postgres refuses to let a value ALTER TYPE ... ADD VALUE just added be
-- *used* -- in a CASE branch, a cast, a comparison -- within the same
-- transaction. 20261109090100_proposal_ops_trip.sql's create_proposal_batch
-- and approve_proposal both switch on these values, so it has to run only
-- after this one has committed.
alter type proposal_op add value 'create_trip';
alter type proposal_op add value 'update_trip';
