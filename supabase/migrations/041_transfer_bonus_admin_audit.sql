-- 041_transfer_bonus_admin_audit.sql
--
-- Migration 040 created points_transfer_bonuses without the transactional
-- admin-audit trigger every other admin-writable offer table carries
-- (migration 011). Without it, an edit made through /admin/transfer-bonuses
-- writes no audit_log row, so a published transfer promotion would have no
-- lineage — the one thing the audit trail exists to prevent.
--
-- The trigger is a no-op unless the request carries `x-dealstack-admin-actor`,
-- which only requireAdmin()-gated requests set, so cron and CLI paths keep
-- their existing explicit audit calls and are unaffected.

drop trigger if exists trg_transactional_admin_audit on public.points_transfer_bonuses;
create trigger trg_transactional_admin_audit
  after insert or update or delete on public.points_transfer_bonuses
  for each row execute function public.audit_admin_mutation();
