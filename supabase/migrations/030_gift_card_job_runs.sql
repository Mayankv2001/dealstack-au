-- DealStack AU — generalise gift_card_ingest_runs into a job-run registry
--
-- NOT APPLIED TO PRODUCTION. Requires explicit user schema review + approval.
-- Apply only AFTER 021–029. Existing rows default to run_kind='ingest'.
--
-- Lock model:
--   1. one running row per (source_id, run_kind), as required by TASK-02;
--   2. an additional mutation fence prevents reconciliation and lifecycle from
--      running together, because both can change the same reviewed offer truth.
--   3. a transactional acquire RPC owns stale-lease recovery, so a dead row in
--      either side of the mutation fence cannot block the other indefinitely.
--
-- Ingest may overlap either mutation job: ingest writes source/raw/candidate
-- staging state and never publishes, activates or archives an approved offer.
-- Different-source ingest jobs may also overlap. Reconciliation and lifecycle
-- remain mutually exclusive even though their ledger rows are kind-scoped.
--
-- The replacement indexes are created before the legacy global lock is dropped,
-- so the migration never opens an unprotected acquisition window. The legacy
-- lock already guarantees that existing running rows satisfy both new indexes.
--
-- Rollback (requires a quiesced job registry):
-- Multiple post-migration running rows are valid, so first stop all job callers
-- and finalise all but one running row. Then restore the legacy global lock
-- BEFORE dropping the replacement locks and classification column:
--   create unique index idx_gc_ingest_runs_one_running
--     on public.gift_card_ingest_runs ((true)) where status = 'running';
--   drop index if exists public.idx_gc_job_runs_mutation_fence;
--   drop index if exists public.idx_gc_job_runs_one_running_per_kind;
--   drop index if exists public.idx_gc_ingest_runs_kind;
--   drop index if exists public.idx_gc_job_runs_expired_lease;
--   drop function if exists public.acquire_gift_card_job_run(text, text, timestamptz, timestamptz);
--   alter table public.gift_card_ingest_runs drop constraint if exists gift_card_job_runs_lease_window_check;
--   alter table public.gift_card_ingest_runs drop column if exists lease_expires_at;
--   alter table public.gift_card_ingest_runs drop column if exists run_kind;
-- Export non-ingest classifications first if that operational history matters.

alter table public.gift_card_ingest_runs
  add column if not exists run_kind text not null default 'ingest'
    check (run_kind in ('ingest', 'reconcile', 'activate-archive'));

alter table public.gift_card_ingest_runs
  add column if not exists lease_expires_at timestamptz;

-- Preserve every existing row. The legacy global lock means at most one can be
-- running during this backfill; completed history receives a deterministic
-- expiry too so the column can safely become NOT NULL.
update public.gift_card_ingest_runs
set lease_expires_at = started_at + case run_kind
  when 'activate-archive' then interval '6 minutes'
  when 'reconcile' then interval '30 minutes'
  else interval '15 minutes'
end
where lease_expires_at is null;

alter table public.gift_card_ingest_runs
  alter column lease_expires_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.gift_card_ingest_runs'::regclass
      and conname = 'gift_card_job_runs_lease_window_check'
  ) then
    alter table public.gift_card_ingest_runs
      add constraint gift_card_job_runs_lease_window_check
      check (
        lease_expires_at > started_at
        and lease_expires_at <= started_at + interval '1 hour'
      );
  end if;
end
$$;

-- Same-source/same-kind retries cannot both acquire a running slot.
create unique index if not exists idx_gc_job_runs_one_running_per_kind
  on public.gift_card_ingest_runs (source_id, run_kind)
  where status = 'running';

-- Reconcile and activate/archive both mutate reviewed offer truth. Their rows
-- are anchored to the primary source today, but the constant-key fence remains
-- correct if either job later spans or is anchored to another source.
create unique index if not exists idx_gc_job_runs_mutation_fence
  on public.gift_card_ingest_runs ((true))
  where status = 'running'
    and run_kind in ('reconcile', 'activate-archive');

-- Supports source/kind-scoped stale takeover and interval lookups.
create index if not exists idx_gc_ingest_runs_kind
  on public.gift_card_ingest_runs (source_id, run_kind, started_at desc);

create index if not exists idx_gc_job_runs_expired_lease
  on public.gift_card_ingest_runs (lease_expires_at)
  where status = 'running';

-- Drop only after both replacement safety indexes exist.
drop index if exists public.idx_gc_ingest_runs_one_running;

-- Atomically recover expired leases and acquire a new source/kind slot. Normal
-- takeover is exact source+kind. The only cross-kind recovery is within the
-- mutation fence: an expired reconcile/lifecycle lease may be finalised by the
-- other mutator, preventing an abandoned row from blocking the fence forever.
-- A live conflicting lease remains untouched and the unique index returns NULL.
create or replace function public.acquire_gift_card_job_run(
  p_source_id text,
  p_run_kind text,
  p_started_at timestamptz,
  p_lease_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  if p_source_id is null or pg_catalog.btrim(p_source_id) = '' then
    raise exception 'A source ID is required.';
  end if;
  if p_run_kind not in ('ingest', 'reconcile', 'activate-archive') then
    raise exception 'Unknown gift-card run kind.';
  end if;
  if p_started_at is null
     or p_lease_expires_at is null
     or p_lease_expires_at <= p_started_at
     or p_lease_expires_at > p_started_at + interval '1 hour' then
    raise exception 'A valid gift-card job lease window is required.';
  end if;

  -- Serialises recovery + insert across callers; the unique indexes remain the
  -- final DB-level guard even for direct service-role table writes.
  perform pg_catalog.pg_advisory_xact_lock(216030);

  update public.gift_card_ingest_runs
  set status = 'error',
      completed_at = p_started_at,
      error_summary = 'superseded: job lease expired'
  where status = 'running'
    and lease_expires_at <= p_started_at
    and (
      (source_id = p_source_id and run_kind = p_run_kind)
      or (
        p_run_kind in ('reconcile', 'activate-archive')
        and run_kind in ('reconcile', 'activate-archive')
      )
    );

  insert into public.gift_card_ingest_runs (
    source_id,
    started_at,
    lease_expires_at,
    run_kind
  ) values (
    p_source_id,
    p_started_at,
    p_lease_expires_at,
    p_run_kind
  )
  returning id into v_run_id;

  return v_run_id;
exception
  when unique_violation then
    return null;
end;
$$;

revoke all on function public.acquire_gift_card_job_run(text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.acquire_gift_card_job_run(text, text, timestamptz, timestamptz)
  to service_role;
