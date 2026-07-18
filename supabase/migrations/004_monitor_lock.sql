-- Prevent overlapping Vercel Cron invocations from polling the same feed.
-- Service-role only; expired leases can be replaced after a crashed run.

create table if not exists monitor_locks (
  name         text primary key,
  holder_id    uuid not null,
  acquired_at  timestamptz not null default now(),
  expires_at   timestamptz not null
);

create index if not exists idx_monitor_locks_expires
  on monitor_locks (expires_at);

alter table monitor_locks enable row level security;
-- No anon/authenticated policies. The cron route uses the service role.
