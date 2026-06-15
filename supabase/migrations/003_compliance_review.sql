-- DealStack AU — compliance reviews (Phase: OzBargain monitor governance)
--
-- Records the human compliance review that MUST be completed and approved before
-- any feed monitor is enabled. This migration only creates the schema — there is
-- NO fetcher, cron, or agent, and nothing here makes any external request. See
-- docs/ozbargain-monitoring.md.
--
-- Security model (same posture as the feed_* staging tables in 002):
--   * RLS enabled, default-deny.
--   * NO anon/authenticated policies — service-role only, for the admin-gated
--     compliance page. The public site never reads this table.
--
-- Relies on pgcrypto (gen_random_uuid) and set_updated_at(), both from 001.

create table if not exists compliance_reviews (
  id                       uuid primary key default gen_random_uuid(),
  source_name              text not null,
  -- Pre-flight checklist items (see docs/ozbargain-monitoring.md).
  robots_txt_checked       boolean not null default false,
  terms_checked            boolean not null default false,
  feed_paths_allowed       boolean not null default false,
  user_agent_recorded      boolean not null default false,
  rate_limit_recorded      boolean not null default false,
  -- The gate: monitoring stays off until a review has this set true.
  approved_for_monitoring  boolean not null default false,
  reviewer_email           text,
  notes                    text,
  reviewed_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ── helpful index ────────────────────────────────────────────────────────────
create index if not exists idx_compliance_reviews_created
  on compliance_reviews (created_at desc);

-- ── updated_at trigger ───────────────────────────────────────────────────────
create trigger trg_compliance_reviews_updated_at before update on compliance_reviews
  for each row execute function set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Enable RLS (default-deny) and add NO policies: anon/authenticated get zero
-- access. All reads/writes go through the service role (admin-gated server
-- actions), which bypasses RLS — same posture as admins / audit_log / feed_*.
alter table compliance_reviews enable row level security;
