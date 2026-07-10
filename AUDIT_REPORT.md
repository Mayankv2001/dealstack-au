# Production Readiness Audit - 2026-07-10

## Summary

- Bugs found/fixed: 10 high-confidence issues across publication trust, live-data authority, URL safety, monitor egress, response limits, observability, data quality, seeding, timezone copy, and duplicate reporting.
- Security: unsafe persisted schemes/credentials and monitor SSRF-through-redirect paths now fail closed at write, read, render, and fetch boundaries.
- Reliability: configured production no longer resurrects demo data; monitor body reads are bounded/timed; silent stalls are externally observable; diverged signal keys no longer abort the full seed.
- Tests: 109 admin, 201 monitor, and 165 stack tests pass under Node 20. Typecheck, lint, build, `git diff --check`, and 20-route production smoke also pass.
- Production readiness score: **89/100**. Remaining points require production-side configuration/data checks, the planned schema-drift workflow, and transactional admin audit/rate-limit hardening.

## Issues Fixed

### High - Raw feed content could cross the homepage publication boundary
- File: `lib/repos/topDeals.ts`, signal admin actions, Top Deals tests.
- Root cause: imported feed state was treated as sufficient publication authority.
- Fix: require an imported item joined to an approved, non-sample, unexpired signal; publish moderated signal copy only. Feed enablement remains operational, not editorial.
- Why correct: both query and pure mapper enforce the two-step opt-in.
- Risk: low; invalid candidates disappear rather than exposing raw content.

### High - Configured production could display demo offers and store codes
- File: `lib/supabase/server.ts`, public repositories, calculator/card props.
- Root cause: DB empty/error states fell back to bundled examples and client components imported static stores.
- Fix: one `fromDbOrDemo` policy; configured reads fail closed to empty, while no-env/explicit-static builds retain demo mode. Expired store codes suppress only the discount layer.
- Why correct: preserves CI/demo availability without representing examples as live production data.
- Risk: medium availability tradeoff; a DB outage now shows honest empty states.

### High - Unsafe persisted URLs and monitor SSRF exposure
- File: `lib/security/urlPolicy.ts`, admin URL actions, repositories, public/admin renderers, feed source selection.
- Root cause: `URL.canParse` accepts dangerous schemes and monitor source type was not an egress host allowlist.
- Fix: canonical HTTPS/local-path/logo policies, exact feed hosts, defensive legacy-row filtering, and render guards.
- Why correct: unsafe values are rejected before write and independently blocked after direct/legacy DB writes.
- Risk: low; legacy unsafe links become non-clickable and are flagged for repair.

### High - Automatic feed redirects bypassed egress policy
- File: `lib/monitor/fetchFeed.ts`, `lib/monitor/runMonitor.ts`, feed-source repo/tests.
- Root cause: `redirect: "follow"` allowed an approved URL to redirect to an arbitrary target.
- Fix: manual same-host approved redirects, loop detection, and a three-hop cap.
- Why correct: every outbound target is validated before `fetch` is called.
- Risk: low; legitimate cross-host feed redirects must be reviewed and explicitly supported.

### High - Feed timeout and response memory limits were incomplete
- File: `lib/monitor/fetchFeed.ts` and tests.
- Root cause: timeout was cleared after headers and `response.text()` had no bound.
- Fix: one deadline covers redirects and body reads; successful feeds are capped at 2 MiB and error bodies are prefix-limited.
- Why correct: hanging/oversized bodies terminate predictably without losing challenge classification.
- Risk: low; feeds over 2 MiB are rejected and require an intentional policy change.

### Medium - Silent monitor stalls had no machine-readable alert
- File: health derivation, lean status reader, `/api/health/monitor`, smoke/docs/tests.
- Root cause: staleness existed only in an admin-rendered dashboard.
- Fix: bearer-gated, no-store, read-only status endpoint with off/paused/fresh/stale/compliance states.
- Why correct: authentication precedes service-role reads; disabled mode avoids DB dependency; no fetch/write is reachable.
- Risk: external alert delivery still requires manual configuration.

### Medium - Signal seed conflict aborted later table seeding
- File: `scripts/seed-filters.ts`, `scripts/seed.ts`, tests.
- Root cause: `ON CONFLICT (id)` cannot absorb a different-id collision on unique `source_native_id`.
- Fix: pre-read keys and skip/report only native ids owned by another row.
- Why correct: same-id and null keys retain existing behavior in normal and overwrite modes.
- Risk: live seed was not run during this audit because it requires production credentials/Node 22.

### Medium/Low - Data-quality and display correctness gaps
- File: dashboard DQ, Top Deals timestamp label, store/link renderers.
- Root cause: unsafe legacy URLs were invisible to admins, duplicate weekly flags inflated distinct counts, and `AEST` was shown during AEDT.
- Fix: actionable unsafe-URL flags, entity-level flag merging, safe unavailable states, and `Sydney time` copy.
- Why correct: reporting matches its documented semantics and timezone text is season-independent.
- Risk: low.

## Remaining Risks

- Admin mutations and audit rows are separate writes; a true all-or-nothing audit guarantee requires transactional RPCs.
- Admin rate limiting is count-then-insert and fail-open; atomic enforcement needs a database function/migration.
- `PLAN-schema-drift-watchdog.md` remains unimplemented and locally modified outside this audit.
- Production still needs schema verification, real card/offer review, expired-row cleanup, external health alert setup, and the detection go-live decision.

## Changed Files

- Trust/data core: `lib/supabase/server.ts`, `lib/repos/index.ts`, `lib/repos/offers.ts`, `lib/repos/sourceResults.ts`, `lib/repos/stores.ts`, `lib/repos/topDeals.ts`, `lib/repos/weeklyDeals.ts`, `lib/stack/loadStack.ts`, `lib/stack/smartStack.ts`, `lib/offers/cardReadiness.ts`, `lib/offers/weeklyPicks.ts`, `lib/security/urlPolicy.ts`.
- Monitor/ops core: `lib/monitor/fetchFeed.ts`, `lib/monitor/health.ts`, `lib/monitor/runMonitor.ts`, `lib/admin/repos/feedSources.ts`, `lib/admin/repos/monitorStatus.ts`, `lib/admin/repos/dashboard.ts`, `app/api/health/monitor/route.ts`.
- Admin boundaries: `app/admin/(protected)/card-offers/actions.ts`, `cashback/actions.ts`, `gift-cards/actions.ts`, `points/actions.ts`, `weekly-deals/actions.ts`, `stores/actions.ts`, `signals/actions.ts`, `signals/sources/actions.ts`, `signals/queue/actions.ts`, `signals/queue/QueueClient.tsx`, `offer-changes/OfferChangesClient.tsx`, `dashboard/page.tsx`, `components/admin/CardOfferForm.tsx`.
- Public data/UI: `app/search/page.tsx`, `app/stores/[slug]/page.tsx`, `components/CardOfferCard.tsx`, `DealStackCalculator.tsx`, `DealsClient.tsx`, `HomeClient.tsx`, `HotBuys.tsx`, `SignalDealCard.tsx`, `SmartStackResultCard.tsx`, `SourceResultCard.tsx`, `StackRecommendationCard.tsx`, `StoreLogo.tsx`, `TopDealsSection.tsx`, `WeeklyDealCard.tsx`.
- Scripts: `scripts/seed-filters.ts`, `scripts/seed.ts`, `scripts/smoke-routes.ts`.
- Tests: `tests/admin/seedFilters.test.ts`, `tests/admin/urlPolicy.test.ts`, `tests/monitor/fetchFeed.test.ts`, `health.test.ts`, `healthRoute.test.ts`, `runMonitor.test.ts`, `topDeals.test.ts`, `tests/stack/sourceResultsTrust.test.ts`, `storeTrust.test.ts`, `weeklyPicks.test.ts`.
- Plans/state/runbooks: `.env.example`, `FINAL-LAUNCH-CHECKLIST.md`, `PROJECT_STATE.md`, `PLAN-live-data-trust.md`, `PLAN-monitor-health-endpoint.md`, `PLAN-seed-signals-conflict.md`, `PLAN-top-deals-approved-signal-boundary.md`, `PLAN-url-trust-boundaries.md`, `docs/ozbargain-monitoring.md`, `docs/production-readiness.md`.
