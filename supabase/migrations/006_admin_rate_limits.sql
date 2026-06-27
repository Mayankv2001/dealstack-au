-- DealStack AU — admin mutation rate-limit ledger
--
-- Backs server-side rate limiting for admin Server Actions (see
-- lib/admin/rate-limit.ts). Each successful, under-the-limit admin mutation
-- inserts one row keyed by the authenticated admin email; the limiter counts
-- rows in a rolling 60-second window and blocks once 30 are present.
--
-- Why a dedicated table (not audit_log): audit_log is historical evidence and
-- must stay append-only and meaningful. This ledger is high-frequency control
-- data that is safe to compact/delete — keeping it separate lets us prune it
-- freely without touching the audit trail.
--
-- This is NOT in-memory state (Vercel serverless is stateless), so the limit
-- holds across all serverless invocations of a deployment.
--
-- Security posture: like every other admin table (migrations 001/002), RLS is
-- ENABLED with NO policies — default-deny for the anon/authenticated roles, so
-- the browser can never read or write it. Only the service-role client
-- (getSupabaseAdmin(), used server-side behind requireAdmin()) reaches it, and
-- the service role bypasses RLS. No fetcher, cron, or external call here.

create table if not exists public.admin_rate_limits (
  id bigserial primary key,
  admin_email text not null,
  action_key text not null,
  created_at timestamptz not null default now()
);

-- Hot path: count an admin's recent attempts for a given action key.
create index if not exists admin_rate_limits_lookup_idx
  on public.admin_rate_limits (admin_email, created_at desc);

-- Cleanup path: prune rows older than the window.
create index if not exists admin_rate_limits_cleanup_idx
  on public.admin_rate_limits (created_at);

-- Default-deny: enable RLS and add no policies (service-role only).
alter table public.admin_rate_limits enable row level security;
