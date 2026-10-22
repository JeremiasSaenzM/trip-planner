-- Adds the four operations stays and movements need to the import path
-- (20261021090000_import_proposals.sql). Split into its own migration,
-- deliberately: Postgres allows ALTER TYPE ... ADD VALUE inside a
-- transaction block, but refuses to let that new value be *used* -- in
-- a CASE branch, a cast, a comparison -- within the same transaction
-- ("unsafe use of new value ... New enum values must be committed
-- before they can be used"). The next migration's create_proposal_batch
-- and approve_proposal both switch on these values, so it has to run
-- only after this one has committed.
alter type proposal_op add value 'create_stay';
alter type proposal_op add value 'create_movement';
alter type proposal_op add value 'update_stay';
alter type proposal_op add value 'update_movement';
