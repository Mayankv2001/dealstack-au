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

It is now its own job: **`GET /api/cron/daily-cleanup`**, scheduled in
`vercel.json` at `0 0 * * *` UTC (10:00 AEST / 11:00 AEDT Sydney — the slot the
monitor cron used to carry it from), authenticated with `CRON_SECRET`. It makes no outbound requests —
it talks only to our own Supabase project. Migration 039 re-issues
`run_daily_cleanup` with the signal/feed branches stripped, which changes its
signature from four arguments to two.

See [offer-expiry-semantics.md](offer-expiry-semantics.md) for the full
four-layer expiry model.

## Migration 039 — APPLIED 2026-07-25

`supabase/migrations/039_remove_ozbargain.sql` has been **applied to
production**. All eight tables and their routines are gone; verified afterwards
as 0 OzBargain tables, 0 OzBargain functions, and every surviving table
(stores 9, gift cards 18, cashback 2, points 4, card offers 5, weekly deals 4,
audit_log 176, admins 1) unchanged from the pre-flight snapshot.

The project is on the Supabase **free plan, so there is no point-in-time
recovery**. A JSON backup of all 1,125 rows was taken immediately beforehand and
verified (row counts matched production exactly):

    ~/dealstack-ozbargain-backup-2026-07-25/

Keep that directory until you are certain nothing is needed from it. There is no
down-migration.

**First attempt failed and rolled back cleanly** — `audit_system_offer_change_insert()`
was dropped before `offer_change_candidates`, but its trigger lived on that
table. The function drop now sits after the table drops. Worth remembering for
any future teardown migration: drop trigger-owning tables before their functions.

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
