-- DealStack AU — feed import queue (Phase: manual OzBargain import staging)
--
-- Staging tables for the PLANNED, compliance-gated OzBargain monitor. This
-- migration only creates the schema — there is NO fetcher, cron, or agent, and
-- nothing here fetches OzBargain or makes any external request. See
-- docs/ozbargain-monitoring.md. Automated fetching must NOT be built until the
-- compliance review in that document is complete.
--
-- Design:
--   * feed_sources   — admin-curated allowlist of permitted feeds + poll state.
--   * feed_items     — raw, deduped snapshots awaiting manual review/promotion.
--   * feed_fetch_log — append-only per-run audit for observability/backoff.
--
-- Security model (stricter than the public tables in 001):
--   * RLS enabled on all three, default-deny.
--   * NO anon/authenticated policies at all — these are service-role only,
--     for future admin-gated import tooling. The public site never reads them.
--   * Only the existing ozbargain_signals.status = 'approved' rows are public;
--     this queue feeds that table via manual review, it does not bypass it.
--
-- Relies on pgcrypto (gen_random_uuid) and set_updated_at(), both from 001.

-- ── feed_sources — allowlist of permitted feeds + polling state ──────────────
create table if not exists feed_sources (
  id                      uuid primary key default gen_random_uuid(),
  label                   text not null,
  feed_url                text not null unique,
  -- Targeted feeds preferred over the firehose (see plan doc).
  kind                    text not null
                            check (kind in ('front', 'store', 'category')),
  -- Optional link to a tracked store; cleared if that store is removed.
  merchant_id             text references stores (id) on delete set null,
  -- Feeds start DISABLED. Enabling is a manual step, only after compliance review.
  is_enabled              boolean not null default false,
  -- Conditional-GET state so unchanged feeds cost nothing (ETag / Last-Modified).
  etag                    text,
  last_modified           text,
  last_fetched_at         timestamptz,
  -- Summary of the last run; raw HTTP code lives in feed_fetch_log.http_status.
  last_status             text
                            check (last_status in ('ok', 'not-modified', 'error', 'blocked')),
  -- Backoff state: failures raise the count and push out the next allowed fetch.
  failure_count           integer not null default 0,
  next_earliest_fetch_at  timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ── feed_items — raw snapshots / dedupe / review triage ──────────────────────
create table if not exists feed_items (
  id                  uuid primary key default gen_random_uuid(),
  feed_source_id      uuid not null references feed_sources (id) on delete cascade,
  -- Stable OzBargain node/guid id — the idempotent upsert + dedupe key.
  source_native_id    text not null unique,
  link                text not null,
  raw_title           text not null,
  raw_summary         text not null default '',
  categories          text[] not null default '{}',
  posted_at           timestamptz,
  fetched_at          timestamptz not null default now(),
  -- Hash of the meaningful fields, to detect changed re-posts.
  content_hash        text,
  -- Ingestion triage state (separate from ozbargain_signals.status moderation).
  review_state        text not null default 'new'
                        check (review_state in ('new', 'imported', 'ignored', 'duplicate')),
  -- Set once promoted into a (pending) signal; cleared if that signal is deleted.
  promoted_signal_id  text references ozbargain_signals (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── feed_fetch_log — append-only per-run audit ───────────────────────────────
create table if not exists feed_fetch_log (
  id              uuid primary key default gen_random_uuid(),
  feed_source_id  uuid not null references feed_sources (id) on delete cascade,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  -- Raw HTTP status (incl. 304); null when the request never completed.
  http_status     integer,
  items_seen      integer not null default 0,
  items_new       integer not null default 0,
  error           text,
  created_at      timestamptz not null default now()
);

-- ── helpful indexes ──────────────────────────────────────────────────────────
-- "Which enabled feeds are due to fetch?" (scheduler) — also covers is_enabled.
create index if not exists idx_feed_sources_enabled_due
  on feed_sources (is_enabled, next_earliest_fetch_at);
-- Review queue lists items by source and by triage state.
create index if not exists idx_feed_items_source on feed_items (feed_source_id);
create index if not exists idx_feed_items_review_state on feed_items (review_state);
create index if not exists idx_feed_items_promoted on feed_items (promoted_signal_id);
-- Recent runs per feed (observability / backoff inspection).
create index if not exists idx_feed_fetch_log_source_started
  on feed_fetch_log (feed_source_id, started_at desc);

-- ── updated_at triggers ──────────────────────────────────────────────────────
-- feed_fetch_log is append-only (no updated_at), so it gets no trigger.
create trigger trg_feed_sources_updated_at before update on feed_sources
  for each row execute function set_updated_at();
create trigger trg_feed_items_updated_at before update on feed_items
  for each row execute function set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Enable RLS (default-deny) and add NO policies: anon/authenticated get zero
-- access. All reads/writes go through the service role (future admin-gated
-- import tooling), which bypasses RLS — same posture as admins / audit_log.
alter table feed_sources    enable row level security;
alter table feed_items      enable row level security;
alter table feed_fetch_log  enable row level security;

-- ── Example feed source (DISABLED placeholder — NOT a real endpoint) ─────────
-- Intentionally a non-network example.com URL and is_enabled = false. It exists
-- only to document the row shape. Do NOT add real OzBargain feed URLs or enable
-- anything until the compliance decision log in docs/ozbargain-monitoring.md is
-- signed off.
insert into feed_sources (label, feed_url, kind, is_enabled)
values (
  '[EXAMPLE — DISABLED] placeholder feed (do not enable until compliance review)',
  'https://example.com/placeholder-feed.xml',
  'front',
  false
)
on conflict (feed_url) do nothing;
