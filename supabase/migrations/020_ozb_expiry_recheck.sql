-- DealStack AU — OzBargain source-expiry recheck (pending review items)
--
-- Adds a SEPARATE, production-safe recheck job that revalidates PENDING
-- (review_state = 'new') OzBargain feed_items against their original source
-- post and archives them once the source is confidently gone. It is fully
-- independent of the ingestion pipeline (015/016/019) and of the published-
-- signal validator (dailyPipeline.validatePublishedSignals): this migration
-- touches only feed_items and a new run-ledger table, and never publishes,
-- imports, or hard-deletes anything.
--
-- Detection uses two compliant signals and nothing else (NO HTML scraping,
-- NO new fetch path):
--   1. DELETION — the existing status-only HEAD primitive
--      (lib/monitor/validateSourcePost) via the approved OzBargain post
--      allow-list (lib/security/urlPolicy); only a permanent 404/410 counts.
--   2. EXPIRY — structured fields OzBargain publishes in its own RSS feeds
--      (<ozb:title-msg type="expired"> marker; <ozb:meta expiry> timestamp),
--      captured by the ingestion parser into the two feed_items columns below
--      and consumed here with ZERO additional outbound requests.
-- See docs/ozbargain-expiry-recheck.md for the exact rules.
--
-- Every archival is an in-place state transition (review_state -> 'archived')
-- plus an audit row, wrapped in one function so the two can never diverge.

-- ── feed_items: per-item recheck / archival bookkeeping ──────────────────────
alter table public.feed_items
  -- Structured source facts captured from the APPROVED feed XML at ingest time:
  -- OzBargain's <ozb:meta expiry="…"> declared-expiry timestamp and its
  -- <ozb:title-msg type="expired"> explicit expired/out-of-stock marker. These
  -- ride the already-approved feed fetch — no new outbound request shape, no
  -- HTML retrieval. They are the compliant producers of the recheck job's
  -- 'expired' classification (see lib/monitor/recheckExpiry.ts).
  add column if not exists declared_expires_at timestamptz,
  add column if not exists source_marked_expired boolean not null default false,
  add column if not exists source_status text
    check (source_status in ('active', 'expired', 'deleted', 'unknown', 'fetch_failed')),
  -- Timestamp of the last recheck ATTEMPT (any outcome) — drives batch ordering
  -- (never-checked first, then oldest-checked) and the min-interval throttle.
  add column if not exists last_source_check_at timestamptz,
  -- Last time the source post was confirmed ACTIVE (2xx). Resets the streak.
  add column if not exists last_validated_at timestamptz,
  -- Short, safe reason for the last non-active outcome (never a response body).
  add column if not exists last_validation_error text,
  add column if not exists consecutive_validation_failures integer not null default 0,
  -- When the CURRENT run of transient/unknown failures began — enforces the
  -- "confirmed unavailable only after a meaningful time window" safety rule.
  add column if not exists failure_streak_started_at timestamptz,
  -- When the source was first confirmed expired/deleted/unavailable (archival).
  add column if not exists source_expired_at timestamptz,
  add column if not exists archived_at timestamptz,
  -- Archival happens ONLY on an explicit source state: an OzBargain "expired"
  -- marker (source_expired) or a confirmed deletion / 404 / 410 (source_deleted).
  -- There is deliberately NO "unavailable after N failures" reason — transient
  -- failures (timeout/429/5xx/DNS/anti-bot) keep the item in Review, forever.
  add column if not exists archive_reason text
    check (archive_reason in ('source_expired', 'source_deleted'));

-- Allow the new terminal 'archived' triage state (expired/removed source).
-- Archived rows leave the active review queue (review_state = 'new') but are
-- kept forever: they are NOT in the purge_reviewed_feed_items() delete set
-- ('ignored', 'rejected'), so history/audit is preserved.
alter table public.feed_items
  drop constraint if exists feed_items_review_state_check;
alter table public.feed_items
  add constraint feed_items_review_state_check
  check (review_state in ('new', 'imported', 'ignored', 'duplicate', 'rejected', 'archived'));

-- "Which pending items are due for a recheck?" — never-checked first, then the
-- oldest-checked. Partial index keeps it to the small pending set.
create index if not exists idx_feed_items_recheck_due
  on public.feed_items (last_source_check_at nulls first)
  where review_state = 'new';

-- ── ozb_recheck_runs — narrowly scoped run ledger for the expiry job ─────────
-- Separate from daily_pipeline_runs so the two jobs have INDEPENDENT one-running
-- locks (reusing that table's lock would serialise the two unrelated crons).
create table if not exists public.ozb_recheck_runs (
  id           uuid primary key default gen_random_uuid(),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running'
                 check (status in ('running', 'ok', 'partial', 'error', 'disabled', 'skipped')),
  -- Preview runs classify + count but write nothing (no feed_items change, no
  -- archival audit). Defaults true so an accidental first run is read-only.
  dry_run          boolean not null default true,
  scanned          integer not null default 0,
  active           integer not null default 0,
  expired          integer not null default 0,
  deleted          integer not null default 0,
  unknown          integer not null default 0,
  fetch_failed     integer not null default 0,
  -- Items that WOULD be archived (explicit expired/deleted). In a dry run this
  -- can be > 0 while actually_archived stays 0.
  would_archive    integer not null default 0,
  actually_archived integer not null default 0,
  skipped          integer not null default 0,
  errors           jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists idx_ozb_recheck_runs_started
  on public.ozb_recheck_runs (started_at desc);

-- Hard DB-level lock: at most one 'running' recheck row at a time (mirrors the
-- daily-pipeline lock from migration 016). Stale-run takeover lives in app code.
create unique index if not exists idx_ozb_recheck_runs_one_running
  on public.ozb_recheck_runs ((true))
  where status = 'running';

-- Service-role only, same posture as the other private staging tables.
alter table public.ozb_recheck_runs enable row level security;

-- ── archive_recheck_feed_item — transactional archive + audit ────────────────
-- Archives ONE pending feed item when its source is confirmed gone. Guards on
-- review_state = 'new' so it can never touch an imported (published) or already
-- archived/rejected row. Never deletes. Writes a matching audit_log row in the
-- same transaction, so a state change and its audit trail cannot diverge.
create or replace function public.archive_recheck_feed_item(
  p_feed_item_id uuid,
  p_archive_reason text,
  p_source_status text,
  p_source_identifier text,
  p_run_id uuid,
  p_checked_at timestamptz,
  -- Which signal produced the archival (audit provenance): e.g.
  -- 'feed-expired-marker', 'feed-declared-expiry-passed', 'source-http-404'.
  p_signal text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.feed_items%rowtype;
begin
  if p_archive_reason not in ('source_expired', 'source_deleted') then
    raise exception 'invalid archive reason: %', p_archive_reason;
  end if;

  select * into item from public.feed_items where id = p_feed_item_id for update;
  if not found then return false; end if;
  -- Only PENDING review items are in scope — approved/imported/rejected/already
  -- archived rows are left untouched (idempotent, race-safe).
  if item.review_state <> 'new' then return false; end if;

  update public.feed_items
  set review_state = 'archived',
      source_status = p_source_status,
      archive_reason = p_archive_reason,
      archived_at = p_checked_at,
      source_expired_at = coalesce(item.source_expired_at, p_checked_at),
      last_source_check_at = p_checked_at,
      last_validation_error = null,
      reviewed_at = p_checked_at,
      reviewed_by = 'system@dealstack.local'
  where id = item.id;

  insert into public.audit_log(actor_email, action, table_name, row_id, diff)
  values (
    'system@dealstack.local',
    'auto-archive-recheck',
    'feed_items',
    item.id,
    jsonb_build_object(
      'priorStatus', item.review_state,
      'newStatus', 'archived',
      'archiveReason', p_archive_reason,
      'sourceStatus', p_source_status,
      'sourceIdentifier', p_source_identifier,
      'signal', p_signal,
      'runId', p_run_id,
      'checkedAt', p_checked_at
    )
  );
  return true;
end;
$$;

revoke all on function
  public.archive_recheck_feed_item(uuid, text, text, text, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function
  public.archive_recheck_feed_item(uuid, text, text, text, uuid, timestamptz, text)
  to service_role;
