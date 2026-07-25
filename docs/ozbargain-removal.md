# OzBargain removal

OzBargain was removed from DealStack AU on 2026-07-25. This note records what
went, what replaced it, and the one step that is still outstanding.

Older documents in `docs/` (handoffs, launch-management files, audits, backlogs)
still describe the OzBargain pipeline. They are **dated records of what was true
when they were written** and were deliberately left unedited. This page is the
current state; where the two disagree, this page wins.

## Why

Not a live vulnerability. The ingestion path was already hardened — RSS/Atom
only, an HTTPS host allowlist with per-hop redirect revalidation, a byte cap and
timeout, two independent env kill switches, and mandatory admin review before
anything reached the public site. It was removed because the subsystem had grown
into the largest and least-loved part of the codebase and the project no longer
wanted to carry it.

## What was removed

- **Crons** — the `monitor-feeds` and `recheck-ozbargain-expiry` Vercel crons,
  their routes, `/api/health/monitor`, and the `monitor-feeds-trigger` /
  `monitor-health` GitHub workflows.
- **Pipeline** — all of `lib/monitor/` (feed parsing, ranking, offer-change
  detection, expiry recheck, the daily pipeline orchestrator) and its scripts,
  fixtures and tests.
- **Admin** — the Signals, Review, Feed Sources, Offer Changes, Compliance and
  Monitor pages, their repos and their form components.
- **Public** — the `OzBargainSignal` type and every surface built on it: the
  homepage "today's top deals" feed, `/deals/signal/[id]`, the `community` deal
  kind, Smart Stack product comparison and the search "Community pulse" section.
- **Config** — every `OZB_*` environment variable.

Two things went with them because they had no data source left, not because they
were OzBargain-specific:

- the **/deals price filter** (`maxPrice`) — signals were the only deal source
  that carried a price, so every selection would have returned zero results;
- the **`signal` weekly-deal highlight** — no production row used it.

## What replaced the cron

`run_daily_cleanup` unpublishes expired gift-card / cashback / points / weekly
rows and archives card offers past their expiry or review-by date. It was only
ever invoked by the OzBargain monitor cron, so removing that cron would have
silently stopped offer-expiry hygiene for the *surviving* catalogue.

It is now its own job: **`GET /api/cron/daily-cleanup`**, scheduled daily in
`vercel.json`, authenticated with `CRON_SECRET`. It makes no outbound requests —
it talks only to our own Supabase project. Migration 039 re-issues
`run_daily_cleanup` with the signal/feed branches stripped, which changes its
signature from four arguments to two.

See [offer-expiry-semantics.md](offer-expiry-semantics.md) for the full
four-layer expiry model.

## Outstanding: apply migration 039

`supabase/migrations/039_remove_ozbargain.sql` is written but **not applied**.
Until it runs, the tables still exist in production holding their data; nothing
reads or writes them.

The migration drops eight tables and their routines. At the time it was written
production held 215 approved signals, 824 feed items, 5 feed sources, 57
fetch-log rows, 2 compliance reviews, 14 pipeline runs and 8 recheck runs.

**Take a backup, or confirm PITR covers the window, before applying it.** There
is no down-migration.

Order matters and is encoded in the file: `run_daily_cleanup` is replaced first
so expiry hygiene never lapses, then the feed/signal routines are dropped, then
the tables (children before parents), then the `weekly_deals` highlight check
constraint is narrowed.

`audit_log` rows referencing the dropped tables are **kept** on purpose —
`table_name` is free text with no foreign key, so the history of what was done
to the signals stays readable after the tables are gone.

`lib/supabase/database.types.ts` was hand-edited to match the post-migration
schema so the app compiles today. Re-run `npm run types:gen` after applying to
confirm the generated output matches.
