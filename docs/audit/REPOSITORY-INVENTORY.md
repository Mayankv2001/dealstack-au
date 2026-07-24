# Repository Inventory — DealStack AU

> Audit date: 2026-07-19 · HEAD `9b7365f` (main) · Produced by the full-repository audit session.
> Companion audits live in this folder; the task programme lives in `docs/programme/` and `tasks/`.

## What the system is

An Australian deal-stacking research site: Next.js 16 (App Router) on Vercel Hobby, Supabase Postgres backend (RLS + RPCs), with a static-fallback data mode when Supabase env is absent. All external data is staged behind human admin review; nothing auto-publishes.

## System map

```
Public site (ISR/server components)          Admin portal (auth + RLS + rate limit)
  /            homepage, marquee, stacks       /admin/(protected)/* 30+ pages
  /deals       ranked deals + filters          signals queue, offer changes, monitor,
  /search      cross-source search             gift-card review/predictions/acceptance,
  /stores/[slug], /cards, /cashback            cleanup, compliance, audit, dashboard
  /gift-cards/* 9 routes incl. weekly, plan,
    products, where-to-buy/use, history
  /rewards, /resources, policy pages

Cron routes (all CRON_SECRET bearer, timing-safe, fail-closed)
  /api/cron/monitor-feeds            daily pipeline: archive expired → validate → fetch → detect
  /api/cron/recheck-ozbargain-expiry HEAD-probe pending review items (lock: migration 020)
  /api/cron/gift-card-ingest         GCDB RSS, Sydney-7am + 40h guard (default off)
  /api/cron/gift-card-weekly-ingest  Point Hacks editorial page (default off)
  /api/cron/gift-card-lifecycle      daily activate/archive, Sydney local-day guard
  /api/cron/gift-card-reconcile      daily no-fetch reconciliation + lifecycle fan-out

Health: /api/health/monitor, /api/health/data (bearer-gated, no-store)
Other API: /api/reports/*, /api/card-offers/[id]/report, /api/csp-report, /api/client-error
```

## Schedulers

| Scheduler | What | Notes |
|---|---|---|
| `vercel.json` | monitor-feeds 00:00 UTC; recheck-expiry 12:00 UTC | Hobby plan: both daily slots used |
| GH Actions `gift-card-ingest.yml` | 20:00 + 21:00 UTC daily (both DST equivalents of 7am Sydney) | endpoint decides DST-safely |
| GH Actions `gift-card-weekly-ingest.yml` | same double-slot pattern | endpoint reuses 40h guard — see CRON audit |
| GH Actions `gift-card-lifecycle.yml` | 20:07 + 21:07 UTC | Sydney local-calendar-day idempotency |
| GH Actions `gift-card-reconcile.yml` | 23:00 UTC daily | interval guard, no run-hour gate |
| GH Actions `monitor-health.yml` | every 3h probe of /api/health/monitor | alert channel = workflow failure |
| GH Actions `monitor-feeds-trigger.yml` | manual dispatch only | missed-day backfill |
| GH Actions `schema-drift.yml`, `ci.yml` | drift check; full quality gate | CI: lint, tsc, 6 vitest suites, build, smoke, Playwright |

## Key code locations

| Concern | Files |
|---|---|
| Env access (lazy, fail-closed) | `lib/env.ts` |
| URL/SSRF policy (host allowlists) | `lib/security/urlPolicy.ts` |
| Auth gate + CSP (report-only, nonce) | `proxy.ts`; static headers in `next.config.ts` |
| Admin auth/allowlist | `lib/admin/auth.ts`; rate limit `lib/admin/rate-limit.ts` (fail-open by design) |
| Public expiry convention | `lib/offers/expiry.ts` (`todayAU`, live ON expiry day, null = evergreen) |
| Public freshness labels | `lib/freshness.ts` (7-day window) |
| Gift-card date-state | `lib/giftcards/dateState.ts` (null expiry ≠ ongoing) |
| Stack engine | `lib/stack/buildStack.ts` (952 lines, pure, injected data/clock) + `lib/stack/compatibility.ts` (STALE_DATA_DAYS=21) |
| Simple calculator maths | `lib/calculateStack.ts` (separate, simpler implementation) |
| Feed monitor | `lib/monitor/*` (runMonitor, runDailyPipeline, health, staleness=30h, backoff) |
| Gift-card pipeline | `lib/giftcards/*` (33 modules: runIngest, runGuarded, runReconcile, lifecycle, schedule, extractOffer, classifyChange, approvalValidation…) |
| Gift-card scheduling | `lib/giftcards/schedule.ts` (Sydney 7am hour + 40h guard; daily local-day guard) |
| Public data repos | `lib/repos/*` (Supabase-or-static; configured-empty never falls back to demo) |
| Admin repos (service-role) | `lib/admin/repos/*` (31 modules) |
| Search pipeline | `lib/sources/searchSources.ts` + `ranking.ts` + `normalise.ts`; DB pool `lib/repos/sourceResults.ts` |
| Deals engine | `lib/deals/*` (load, query, score, recommend, merchantFacts) |
| Decision engine | `lib/decision/*` (buildDecisionResult, loadDecisionResult) |
| Structured data | `lib/structuredData.ts`; used on `/`, `/deals/[slug]`, `/stores/[slug]` only |
| Observability | `lib/observability/report-server-error.ts`, `sanitize.ts` |

## Database

- 33 migration files `supabase/migrations/001…033`. Ledger truth (per `docs/gift-card-migration-028-030.md` and `docs/launch-management/PROJECT_STATE.md` §5): **canonical through 032 applied 2026-07-17; 033 written/reviewed, apply still gated**. Note: PROJECT_STATE's header and §"platform" line still say 027–033 unapplied — internally contradictory (see DOC task).
  - **Resolved 2026-07-23:** production is now canonical through **037** (033–035 applied 2026-07-21; 036–037 2026-07-22; `verify:schema` 37/37 — the repo now holds migration files 001…037). PROJECT_STATE was reconciled (commit `1052eb1`), clearing the contradiction. The 033 legacy-offer pre-review (TASK-GC-001) was not completed before the apply — see the ledger reconciliation doc.
- Schema manifest: `scripts/schema-manifest.ts`; `npm run verify:schema`; generated types `lib/supabase/database.types.ts`; `schema-drift.yml` CI check.

## Tests

- 143 vitest files under `tests/` (admin 39, giftcards 53, monitor 21, stack 20, deals 6, decision 2, text 1) — **all green at HEAD when scoped to `tests/`** (verified 2026-07-19: 4,112 passed across the whole scan; the 62 failures all come from stale `.claude/worktrees/**` copies — see TEST-COVERAGE-AUDIT).
- Playwright: one spec `tests/e2e/public-flows.spec.ts` covering ~30 routes on desktop + mobile-chromium, with one axe accessibility test over 7 routes.
- CI (`ci.yml`) runs lint → tsc → six suites → build → HTTP smoke → Playwright (static-fallback data).

## Prior planning corpus (do not duplicate)

- `docs/backlog/DEALSTACK-BACKLOG.md` — 108 tickets DS-001…DS-108 (2026-07-13) + JSON twin, dependency graph, roadmap.
- `tasks/gift-card-automation/` — TASK-00…TASK-39, largely executed (migrations 027–033, lifecycle, reconcile, weekly ingest all shipped since).
- `PLAN-gift-card-end-to-end-automation.md`, `PLAN-gift-card-future-improvements.md` (6-phase forward plan).
- `docs/launch-management/` — launch audit, checklist, 3 executed tasks.
- `docs/DEALSTACK-DECISIONS.md` — existing decision log.

New tasks in `tasks/` (this audit) reference DS-xxx tickets instead of restating them.

## Local working-tree state observed (this machine, 2026-07-19)

- Two stale agent worktrees inside the repo: `.claude/worktrees/focused-fermi-faf446` (at 8dd611d) and `.claude/worktrees/wizardly-haibt-f03b79` (at c00d1a1). They break repo-root `npx vitest run` (62 false failures) and `npm run lint` (~2.5k false errors). See TASK-TEST-002.
- One stash: `stash@{0}` "isolate-concurrent-work-during-alert-removal" — unreviewed.
- A third external worktree `/private/tmp/dealstack-au-design3` (branch `codex/design3-cron-expiry`).
