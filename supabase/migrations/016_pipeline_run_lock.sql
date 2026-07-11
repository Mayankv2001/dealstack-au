-- DealStack AU — daily pipeline run lock (prevents overlapping pipeline runs)
--
-- lib/admin/repos/dailyPipeline.ts::startPipelineRun() previously just INSERTed
-- a status='running' row with no locking. Two overlapping invocations of the
-- cron route (a retried/duplicated Vercel Cron delivery, a manual curl against
-- the secret-gated route while a scheduled run is still in flight, etc.) could
-- each start a run and archive/validate/fetch concurrently. Every pipeline step
-- is independently idempotent, so an overlap was never a correctness bug — but
-- it wastes outbound HEAD-validation requests against OzBargain post URLs and
-- leaves duplicate run rows. This migration adds a hard database-level lock: at
-- most one 'running' row can exist at a time.
--
-- The stale-run takeover (a 'running' row older than 30 minutes is superseded
-- before the next run starts, so a crashed invocation cannot hold this lock
-- forever) lives in application code (startPipelineRun), not SQL.

create unique index if not exists idx_daily_pipeline_runs_one_running
  on public.daily_pipeline_runs ((true))
  where status = 'running';
