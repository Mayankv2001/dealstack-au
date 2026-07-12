# DealStack AU — Opus 4.8 Operational Handoff

> Written 2026-07-12 by the outgoing agent (Claude Fable 5) as the primary
> knowledge-transfer document. Every factual claim below was verified against
> the repository at commit `1d7b87a` and, where marked *(prod-verified)*,
> against the live Supabase project `numgsivlrglflsnqehac` via **read-only**
> SQL on 2026-07-12. Machine-readable companion: `docs/OPUS-4.8-HANDOFF.json`.
> Decision record: `docs/DEALSTACK-DECISIONS.md`. Startup prompt:
> `docs/OPUS-4.8-START-PROMPT.md`.
>
> If anything here contradicts the code, git log, or a read-only production
> probe, **trust those and fix this file**.

---

## A. Executive summary

- DealStack AU is a deal-stacking research tool for Australian shoppers: it combines cashback portals, gift-card promotions, points programmes, bank/card offers and OzBargain feed signals into one interface showing how to stack discounts. Next.js 16 / React 19 / Tailwind v4 on Vercel (Hobby), Supabase Postgres backend.
- **Production is live and healthy.** Working tree is clean, `main` = `origin/main` = `1d7b87a`. All 22 migrations (001–022) are applied to production *(prod-verified via `information_schema`)*. Full Vitest suite passes at HEAD: 898 tests across 88 files.
- **Working:** public site (homepage, `/deals`, `/stores`, `/search`, `/cards`, `/gift-cards` + detail pages, `/resources`, policy pages), admin portal (signals, feed queue, offer changes, gift-card review, monitor, cleanup, audit), stack engine, OzBargain monitor + expiry recheck (gated), gift-card ingestion pipeline (gated, tested end-to-end once), CI, schema-drift watchdog, health endpoints.
- **Gift-card pipeline (newest subsystem):** migrations 021+022 applied to prod; one manual ingest run completed 2026-07-12 (24 items staged); 9 candidates admin-approved and published; ingestion then **re-disabled** — recurring ingestion has never been enabled.
- **Incomplete:** 15 staged candidates still `new` in the review queue *(prod-verified)*; the 13 published gift-card offers carry known data-quality gaps catalogued in `docs/gift-card-offer-corrections-2026-07-12.md` (§J below); `gift_card_products` and `gift_card_knowledge` are empty (0 rows), so acceptance/MCC sections on detail pages fall back honestly.
- **Highest-risk area #1 — published gift-card data quality:** 10 of 13 published rows are `needs-verification`; 7 have no expiry date (rendered honestly as "No end date listed", but the rows still need source re-verification); 2 legacy rows are mis-typed (`discount` 0% when the real mechanic is bonus points) and still contain "Sample:" prose.
- **Highest-risk area #2 — migration ledger drift:** Supabase's tracked migration ledger lists only 16 entries with inconsistent names; truth is established by `information_schema` probing (`npm run verify:schema` + the weekly schema-drift workflow), not the ledger. Never trust `list_migrations` alone.
- **Highest-risk area #3 — stale docs:** `docs/gift-card-pipeline.md` line ~13 still says migration 021 is "not yet applied to production" (it was, 2026-07-12, commit `b541521`); `docs/launch-management/PROJECT_STATE.md` was last updated 2026-07-11 and predates the entire gift-card pipeline rollout and current counts.
- **Trust model (invariant):** nothing external auto-publishes. Every ingested item is staged in service-role-only tables and only reaches a public table through an admin-reviewed, service-role `security definer` RPC. RSS/Atom only — HTML scraping is prohibited outright.
- **Operational gates are all closed right now:** `gift_card_sources.gcdb` has `enabled=false` and `automated_fetch_allowed=false` *(prod-verified)*; `GCDB_INGEST_ENABLED`, `OZB_OFFER_DETECT_ENABLED`, `OZB_EXPIRY_RECHECK_ENABLED` (live mode) are off in Vercel per docs.
- **Single best next task:** the production-data correction pass — review/execute `docs/gift-card-offer-corrections-2026-07-12.md` (§J): re-verify each published row at its cited source, fix mechanics/expiries/codes through the audited admin edit UI, and resolve the Apple-at-Woolworths duplicate. Requires explicit row-level user approval first (§O).
- Node discipline matters: shell defaults to Node 15 — `nvm use 20` for everything; Node 22 only for `npm run seed` and the schema-drift probe (supabase-js WebSocket requirement).
- Two crons exist in `vercel.json` (both daily — Hobby-compliant); external GitHub Actions schedulers handle the sub-daily/health work. Never make `vercel.json` sub-daily.
- This repo's Next.js 16 has breaking changes vs. training data — read `node_modules/next/dist/docs/` before writing framework-level code (AGENTS.md rule).

## B. Repository map

### Public offers (cashback / points / stores / card offers)
- **Purpose:** public read surface for all published offer types.
- **Entry points:** `app/page.tsx` (homepage), `app/deals/page.tsx`, `app/stores/[slug]/page.tsx`, `app/search/page.tsx`, `app/cards/page.tsx`, `app/cards/[id]/page.tsx`, `app/cards/compare/page.tsx`.
- **Core files:** `lib/repos/offers.ts`, `lib/repos/stores.ts`, `lib/repos/sourceResults.ts`, `lib/repos/topDeals.ts`, `lib/repos/topDealsRanking.ts`, `lib/repos/weeklyDeals.ts`, `lib/offers/` (readiness gates, expiry helpers, types), `lib/security/urlPolicy.ts`.
- **Data tables:** `stores`, `cashback_offers`, `points_offers`, `card_offers`, `weekly_deals`, `ozbargain_signals` (approved only).
- **Tests:** `tests/deals/` (14), parts of `tests/monitor/` (top-deals/ranking), `tests/admin/` (readiness), `tests/e2e/public-flows.spec.ts`.
- **Prod dependencies:** Supabase anon reads under RLS; configured DB is authoritative (no static fallback in prod — empty reads stay empty).

### Gift-card offers (public listing)
- **Purpose:** published gift-card promotions with honest valuation.
- **Entry point:** `app/gift-cards/page.tsx`.
- **Core files:** `lib/giftcards/publicQuery.ts` (URL-state → tab/filter/sort), `lib/giftcards/value.ts` (single valuation engine), `lib/giftcards/offerCardViewModel.ts` (pure card view-model), `lib/giftcards/compatibility.ts`, `components/` gift-card card component, `lib/repos/offers.ts` (gift-card read path).
- **Data tables:** `gift_card_offers` (RLS: public sees `is_published=true` and unexpired), `gift_card_products`, `gift_card_merchant_acceptance`.
- **Tests:** `tests/giftcards/publicQuery.test.ts`, `offerCardViewModel.test.ts`, `value.test.ts`, `compatibility.test.ts`.

### Gift-card detail pages
- **Purpose:** answer the eight buyer questions (what / how to claim / which cards / where accepted / MCC restrictions / limits / stackability / what to verify) from structured fields only.
- **Entry point:** `app/gift-cards/[id]/page.tsx`.
- **Core files:** `lib/giftcards/claimSteps.ts`, `termsRows.ts`, `stackability.ts`, `acceptanceModel.ts`, `value.ts#buildWorkedExample`, `lib/repos/giftCardProducts.ts`.
- **Data tables:** `gift_card_offers` (022 detail columns), `gift_card_products` (incl. `unsupported_mccs`), `gift_card_merchant_acceptance`.
- **Tests:** `tests/giftcards/claimSteps.test.ts`, `termsRows.test.ts`, `stackability.test.ts`, `acceptanceModel.test.ts`, `workedExample.test.ts`, and `noSourceProse.test.ts` — a property-access trap proving the page never touches raw source payloads.

### Gift-card ingestion (GCDB pipeline)
- **Purpose:** staged, gated sourcing of gift-card promotions from the GCDB WordPress RSS feed. Nothing publishes without admin review.
- **Entry point:** `app/api/cron/gift-card-ingest/route.ts` (bearer-gated GET; `?force=1` bypasses the run-hour gate only).
- **Core files:** `lib/giftcards/parseGcdbFeed.ts`, `extractOffer.ts`, `classifyChange.ts`, `runIngest.ts` (DI orchestrator), `runGuarded.ts` (lock/finalisation envelope), `schedule.ts` (Sydney 7am + 40h guard), `duplicateDetection.ts`, `lib/admin/repos/giftCardPipeline.ts` (service-role repo).
- **Data tables:** `gift_card_sources`, `gift_card_ingest_runs`, `gift_card_raw_items`, `gift_card_offer_candidates`, `gift_card_knowledge` (all service-role only).
- **Tests:** `tests/giftcards/parseGcdbFeed.test.ts`, `extractOffer.test.ts`, `classifyChange.test.ts`, `runIngest.test.ts`, `runGuarded.test.ts`, `schedule.test.ts`, `giftCardIngestRoute.test.ts`.
- **Prod dependencies:** `CRON_SECRET`, `GCDB_INGEST_ENABLED`, `GCDB_REQUEST_USER_AGENT`, the DB source-row gates, `.github/workflows/gift-card-ingest.yml` as external trigger.

### Admin review (all queues)
- **Purpose:** the only human gate between staged data and the public site.
- **Entry points:** `app/admin/(protected)/review/` (unified queue), `signals/`, `offer-changes/`, `gift-cards/` (incl. `review`), `card-offers/`, `cleanup/`, `monitor/`, `dashboard/`, `audit/`, `compliance/`, `stores/`, `weekly-deals/`, `cashback/`, `points/`, `card-reports/`.
- **Core files:** `lib/admin/repos/*` (service-role isolated), `lib/admin/auth.ts` (`requireAdmin()` → `admins` table), `lib/giftcards/approvalValidation.ts` (blocks approval without seller, value, source URL, and expiry-or-explicit-ongoing).
- **Data tables:** all staging tables + `admins`, `audit_log`, `admin_rate_limits`, `compliance_reviews`.
- **Tests:** `tests/admin/` (174 tests: rate limits, audit, readiness, schema manifest, bulk actions).
- **Notes:** new admins need a hand-created Supabase Auth user (magic link uses `shouldCreateUser: false`) *plus* an `admins` row. Bulk actions capped at 200 rows, one rate-limit unit per batch.

### Stack calculation
- **Purpose:** compute stacked-savings recommendations ("Smart Stack" / best stacks) from published offers.
- **Core files:** `lib/stack/buildStack.ts` (injectable `now` clock), `smartStack.ts`, `compatibility.ts` (incl. `STALE_DATA_DAYS = 21`), `outcome.ts`, `present.ts`, `loadStack.ts`, `citationSummary.ts`, `lib/calculateStack.ts`.
- **Data tables:** reads published offers only — never staging tables.
- **Tests:** `tests/stack/` (235 tests; fixed `TEST_NOW` via `tests/stack/factories.ts`).

### Compatibility analysis
- **Purpose:** one shared five-status vocabulary for "can these offers combine?" across stack engine, gift-card cards and detail pages.
- **Core files:** `lib/giftcards/compatibility.ts` (statuses: `compatible`, `likely-compatible`, `incompatible`, `requires-verification`, `insufficient-evidence`), `lib/giftcards/stackability.ts` (two-stage acquisition-vs-redemption analysis reusing the same statuses), `lib/stack/compatibility.ts`.
- **Tests:** `tests/giftcards/compatibility.test.ts`, `stackability.test.ts`, `tests/stack/`.

### OzBargain monitoring
- **Purpose:** gated RSS ingestion of OzBargain deal feeds into a staged review queue; optional offer-change detection.
- **Entry points:** `app/api/cron/monitor-feeds/route.ts` (Vercel daily cron 00:00 UTC + external scheduler ≤3-hourly), `scripts/monitor-feeds.ts` (local/dry-run).
- **Core files:** `lib/monitor/` — `runMonitor.ts`, `fetchFeed.ts`, `parseFeed.ts`, `mapFeedItem.ts`, `classifyFeedChanges.ts`, `feedItemPreference.ts` (3-tier keyword hierarchy: category > rewards > negatives — read before adding keywords), `detectOffers.ts`, `runDetection.ts`, `runDailyPipeline.ts`, `backoff.ts`, `staleness.ts`, `health.ts`.
- **Data tables:** `feed_sources`, `feed_items`, `feed_fetch_log`, `offer_change_candidates`, `daily_pipeline_runs`, `compliance_reviews`.
- **Tests:** `tests/monitor/` (302 tests).
- **Prod dependencies:** `OZB_MONITOR_ENABLED` + compliance review row + enabled `feed_sources` row; `OZB_OFFER_DETECT_ENABLED` (still off — go-live runbook in `docs/ozbargain-monitoring.md`).

### Expiry recheck (OzBargain)
- **Purpose:** archive pending review items on two explicit source signals only — feed-declared expiry markers (`ozb:meta` expiry / `ozb:title-msg type="expired"`, captured at ingest) and confirmed 404/410 from a status-only HEAD probe. No HTML ever fetched.
- **Entry points:** `app/api/cron/recheck-ozbargain-expiry/route.ts` (Vercel daily cron 12:00 UTC).
- **Core files:** `lib/monitor/recheckExpiry.ts`, `runRecheckExpiry.ts`, `validateSourcePost.ts`, `lib/admin/repos/recheckExpiry.ts`; migration `020_ozb_expiry_recheck.sql` (`feed_items` recheck columns + `ozb_recheck_runs`).
- **Prod dependencies:** `OZB_EXPIRY_RECHECK_ENABLED`, `OZB_EXPIRY_RECHECK_DRY_RUN` (defaults to preview — writes nothing until explicitly `"false"`), batch/interval vars.
- **Docs:** `docs/ozbargain-expiry-recheck.md`.

### Source trust boundaries
- **Purpose:** keep external content quarantined until reviewed; keep URLs safe.
- **Core files:** `lib/security/urlPolicy.ts` (host allowlisting at admin writes, public reads, final renders, and monitor/ingest egress; manual same-host redirects, 3-hop cap, bounded bodies), `lib/offers/cardReadiness.ts` (fail-closed public gate for card offers), `lib/repos/sourceResults.ts` (fail-closed source cards), `tests/giftcards/noSourceProse.test.ts`.

### Monitoring / health
- **Entry points:** `app/api/health/monitor/route.ts` (bearer-gated; 503 on missing compliance / silent stall >30h / unreadable state) and `app/api/health/data/route.ts` (published-freshness counts).
- **Pollers:** `.github/workflows/monitor-health.yml` (every 3h at :23; exit 2 = blind, never silently green). Error reporting: `instrumentation.ts` → `lib/observability/report-server-error.ts` (optional `ALERT_WEBHOOK_URL`, deduped).

### Supabase schema & migrations
- `supabase/migrations/001…022` (see §D). Manifest: `scripts/schema-manifest.ts` — per-column migration ownership; `tests/admin/schemaManifest.test.ts` fails `test:admin` if a committed migration is missing from the manifest. Probe: `scripts/verify-schema.ts` (`npm run verify:schema`, needs service-role env, **Node 22** in CI context). Types: `lib/supabase/database.types.ts`, regenerated via `npm run types:gen`.

### CI / E2E / smoke
- `.github/workflows/ci.yml` — lint, `test:monitor`, `test:stack`, `test:admin`, build, `next start`+`npm run smoke`, Playwright chromium on static-fallback data. **Secretless by design.** (Note: `test:giftcards` and `test:deals` are NOT yet in ci.yml — a known gap; the full local gate covers them.)
- `.github/workflows/schema-drift.yml` — weekly read-only prod probe, Node 22, secrets scoped to the probe step.
- `tests/e2e/public-flows.spec.ts` — 40 Playwright tests (20 × chromium + mobile-chromium), `playwright.config.ts` starts `next start` on port 3210 with `DATA_SOURCE=static`.
- `scripts/smoke-routes.ts` — `npm run smoke -- --base-url=<url>` (base URL is an **argument, not an env var**); `--strict-content` catches placeholder/demo leakage on prod.

### Vercel deployment & cron
- `vercel.json`: two **daily** crons — `/api/cron/monitor-feeds` at 00:00 UTC and `/api/cron/recheck-ozbargain-expiry` at 12:00 UTC. Hobby plan: never sub-daily.
- Gift-card ingest is deliberately NOT a Vercel cron — it is triggered by `.github/workflows/gift-card-ingest.yml` (daily at 20:00 and 21:00 UTC = both possible 7am Sydney equivalents; the route itself decides whether to run).
- Prod URL used by workflows: `https://dealstack-au.vercel.app`. Sensitive Vercel env vars pull as **empty strings** via CLI — "empty" does not mean "unset".

## C. Architecture and trust boundaries

The canonical flow (gift-card pipeline; the OzBargain monitor follows the same shape with its own tables):

```
External source (GCDB RSS, allowlisted host)
  → raw snapshot            gift_card_raw_items          service-role only
  → parsed candidate        gift_card_offer_candidates   service-role only
  → normalised candidate    (editable extraction fields on the candidate)
  → compatibility analysis  compatibility_json + change classification
  → admin review            /admin/gift-cards/review     human gate
  → published offer         gift_card_offers             RLS: is_published
```

- **Private (service-role only, RLS default-deny):** `gift_card_sources`, `gift_card_ingest_runs`, `gift_card_raw_items`, `gift_card_offer_candidates`, `gift_card_knowledge`, `feed_sources`, `feed_items`, `feed_fetch_log`, `offer_change_candidates`, `daily_pipeline_runs`, `ozb_recheck_runs`, `admins`, `audit_log`, `admin_rate_limits`, `card_offer_history`, `card_offer_correction_reports`, `correction_report_rate_limits`, `compliance_reviews`.
- **Publicly readable (anon SELECT under RLS, published/unexpired only):** `stores`, `cashback_offers`, `gift_card_offers`, `points_offers`, `card_offers`, `weekly_deals`, `ozbargain_signals` (approved), plus explicitly-published `gift_card_products` / `gift_card_merchant_acceptance` rows.
- **Publishing RPC:** `approve_gift_card_candidate(candidate_id, offer_id, offer_jsonb, reviewer)` — `security definer`, `set search_path = ''`, **granted to `service_role` only**. One transaction: guard candidate state → upsert `gift_card_offers` from admin-reviewed values → link candidate → write audit row. It never reads the raw payload. (Card offers and signals have their own equivalent admin actions/RPCs, e.g. `approve_feed_item`.)
- **Why no raw candidate may appear publicly:** raw feed content is unreviewed third-party prose — it may be wrong, stale, mis-parsed, or carry content we have no right to republish (GCDB articles, images, comments). Only bounded structured facts (+ a ≤280-char factual excerpt) are stored at all, and only admin-edited values are ever published. `tests/giftcards/noSourceProse.test.ts` enforces this at render level.
- **Seller vs source:** the **seller** is where you buy the card (Coles, Big W, Card.Gift — `gift_card_offers.source` column, surfaced as `sellerLabel`); the **source** is who told us (GCDB — `source_name`/`source_detail_url`). Conflating them misattributes the offer and breaks citation honesty. The view-model shows the source only when it adds information over the seller.
- **URL allowlisting:** `lib/security/urlPolicy.ts`, enforced at four layers — admin writes, public reads, final renders, and monitor/ingest egress (gift-card fetch restricted to `gcdb.com.au`; manual same-host redirects; 3-hop cap; bounded response bodies). Unsafe persisted URLs surface as data-quality flags rather than rendering.
- **Cron authentication:** every cron/health route checks `Authorization: Bearer ${CRON_SECRET}` (timing-safe compare); unset secret → 503, never runs. `?force=1` on the gift-card ingest bypasses only the Sydney-7am **run-hour** gate — never auth, never the env/DB gates, never the 40-hour interval guard.
- **Idempotency & locking:** raw items dedupe on `(source_id, external_id)`; unchanged content only bumps `last_seen`; changed content stages a `changed` candidate. One-running-ingest is enforced by a unique partial index on `gift_card_ingest_runs(status='running')`; `lib/giftcards/runGuarded.ts` guarantees a thrown ingest always finalises the run as `error` (releases the lock). The daily pipeline (016) and recheck runs (020) have equivalent one-running locks.

## D. Production schema state

Verified 2026-07-12 against live prod via `information_schema` *(prod-verified)*. The Supabase migration **ledger is partial and unreliable** (16 entries, inconsistent naming; 001–004, 015, 018–020 were hand-applied without ledger rows). Object-level probing is the source of truth: 27 public tables exist and every migration's declared objects are present.

| # | File | Purpose | Applied to prod? | Types include it? |
|---|---|---|---|---|
| 001 | `001_initial_schema.sql` | Core tables (stores, offers, signals…) | ✅ | ✅ |
| 002 | `002_feed_import_queue.sql` | `feed_sources`/`feed_items`/`feed_fetch_log` | ✅ | ✅ |
| 003 | `003_compliance_review.sql` | `compliance_reviews` | ✅ | ✅ |
| 004 | `004_offer_change_candidates.sql` | `offer_change_candidates` | ✅ | ✅ |
| 005 | `005_feed_item_homepage_hidden.sql` | `feed_items.hidden_from_homepage` | ✅ (found missing 2026-07-08, then applied) | ✅ |
| 006 | `006_admin_rate_limits.sql` | `admin_rate_limits` | ✅ | ✅ |
| 007 | `007_card_offers.sql` | `card_offers` | ✅ | ✅ |
| 008 | `008_pin_function_search_path.sql` | Pin `set_updated_at()` search_path (advisor WARN) | ✅ 2026-07-11 | n/a (no shape change) |
| 009 | `009_card_offer_lifecycle.sql` | Card-offer lifecycle | ✅ 2026-07-11 | ✅ |
| 010 | `010_atomic_admin_rate_limit.sql` | Atomic rate-limit RPC | ✅ | ✅ |
| 011 | `011_transactional_admin_audit.sql` | Transactional audit | ✅ | ✅ |
| 012 | `012_card_offer_correction_reports.sql` | Correction reports + rate limits | ✅ | ✅ |
| 013 | `013_revoke_trigger_function_execute.sql` | Revoke trigger fn execute | ✅ | n/a |
| 014 | `014_signal_product_group.sql` | `ozbargain_signals.product_group` | ✅ | ✅ |
| 015 | `015_daily_deal_pipeline.sql` | `daily_pipeline_runs`, feed-item lifecycle cols, cleanup RPCs | ✅ (`daily_pipeline_runs` exists) | ✅ |
| 016 | `016_pipeline_run_lock.sql` | One-running pipeline lock | ✅ | n/a |
| 017 | `017_card_source_registry.sql` | **Data-only**: registers OzBargain credit-card tag feed (disabled), records Finder rejection | ✅ | n/a |
| 018 | `018_card_offer_change_candidates.sql` | `offer_change_candidates.source_type` + card detection | ✅ (`source_type` column exists) | ✅ |
| 019 | `019_pipeline_lifecycle_retention.sql` | Retention/lifecycle columns (`content_hash` etc.) | ✅ | ✅ |
| 020 | `020_ozb_expiry_recheck.sql` | `feed_items` recheck columns, `ozb_recheck_runs` | ✅ (`ozb_recheck_runs` + `feed_items.source_status` exist) | ✅ |
| 021 | `021_gift_card_pipeline.sql` | Gift-card pipeline tables + `gift_card_offers` structured columns + approve RPC | ✅ 2026-07-12 (ledger `20260712062224`; types commit `b541521`) | ✅ |
| 022 | `022_gift_card_offer_detail.sql` | Detail columns (promo_code…included_product_ids), `gift_card_products.unsupported_mccs`, extended approve RPC | ✅ 2026-07-12 (ledger `20260712074506`; all 9 columns verified live) | ✅ |

- **No migration is pending.** There is no unapplied SQL in `supabase/migrations/`.
- **No temporary type bridges remain.** The loosely-typed client bridge that `lib/admin/repos/giftCardPipeline.ts` used pre-021 was retired when types were regenerated; repos still map 022 columns defensively (`?? null`) so pre-022 environments and the demo fallback degrade honestly — that defensive mapping is deliberate, not a bridge to remove.
- **Known stale doc:** `docs/gift-card-pipeline.md` still says 021 is "not yet applied" near the top. The 022 header comment (in the SQL file) correctly records the apply.
- Offers were hash-verified unchanged across both migration applies (memory: hash `1cd574d9…` before/after).

## E. Gift-card system current state

All figures *(prod-verified 2026-07-12)*:

- **Published offers:** 13 (of 15 total rows; `gc-tcn-jbhifi` and `gc-woolworths-wish` are unpublished — expired, cleaned 2026-07-11).
- **Staged candidates:** 24 total — 9 `approved` (published 2026-07-12), **15 still `review_status='new'`** awaiting admin review at `/admin/gift-cards/review`. Note the queue vocabulary is `new`, not `pending`.
- **Raw items:** 24. **Products:** 0. **Knowledge rows:** 0.
- **Ingestion state:** source row `gcdb` has `enabled=false` AND `automated_fetch_allowed=false` (re-disabled after the one-off test); `GCDB_INGEST_ENABLED` off in Vercel. **Recurring ingestion has never been enabled** — the GitHub workflow fires daily but every invocation no-ops safely at the gates.
- **Latest ingest run:** `d5fed777-4b74-4cd0-8179-5e05cdb36749`, started 2026-07-12 06:40:06 UTC, status `ok`, fetch `ok`, 24 seen / 24 new / 0 updated / 0 unchanged / 0 rejected, ~3.6s.
- **Public listing (`/gift-cards`):** tabs/filter/sort via `publicQuery.ts`; every card rendered from `offerCardViewModel.ts` — seller, source (only when informative), mechanic label, value badge, `brandPrimary` + "+N more", honest missing-expiry label.
- **Detail pages (`/gift-cards/[id]`):** structured sections (claim steps, terms table, two-stage stackability, acceptance model, worked example) that appear only when data exists; "not recorded" fallbacks otherwise; mandatory MCC disclaimer.
- **Admin review:** candidate cards show extraction confidence/warnings, change classification, and duplicate verdicts; `approvalValidation.ts` blocks approval without seller, promotion value, source URL, and an expiry date or explicit "ongoing" tick.
- **Duplicate detection:** `duplicateDetection.ts` — `exact-duplicate` (same canonical source URL) / `probable-duplicate` (same seller+cards+mechanic+value) / `overlapping-campaign` (same seller+cards, differing value/dates). Advisory only — admin decides.
- **Expiry handling:** RLS + read guards hide expired rows from actionable listings; missing expiry renders "No end date listed", never "Ongoing".
- **Compound-offer limitation:** one source page with several sub-offers is currently flattened into ONE offer row (worst case: `gc-amazon-ultimate-…` — a 33-brand Amazon campaign as one `brand` string). `included_product_ids` (022) is the starting hook; real fix is future work (§O).
- **Product-acceptance knowledge gap:** with 0 `gift_card_products` rows, acceptance/MCC sections are empty everywhere; TCN/Ultimate/Apple product families need product + acceptance rows to unlock them.
- **Production-data discrepancies:** the full row-level catalogue is §J / `docs/gift-card-offer-corrections-2026-07-12.md`. Headlines: 10/13 published rows `needs-verification`; 7 rows have `expiry_date=null`; all 15 rows have `format='unknown'`; no row has `promo_code`, `terms_url` or product links yet (columns exist but are unpopulated); `gc-ultimate-jbhifi` expires 2026-07-15; `gc-amazon-ultimate-…` expires 2026-07-13 (imminent); 2 legacy rows are mechanically mis-typed.

## F. Data-model lessons learned (GCDB analysis)

| # | Lesson | Status |
|---|---|---|
| 1 | One source page can contain multiple sub-offers (e.g. one Amazon campaign spanning promo-code discount + capped variants). Flattening loses truth. | ⚠️ **Future work** — currently flattened; `included_product_ids` is the only hook. |
| 2 | Direct % discounts, fixed-dollar discounts, bonus value, points multipliers, promo credit and fee waivers are **different mechanics** needing different fields and different valuation maths. | ✅ Partially implemented: `promotion_type` + `discount_percent`/`bonus_percent`/`points_multiplier` + one valuation engine (`value.ts`). Fixed-dollar/credit/fee-waiver mechanics not yet modelled. |
| 3 | Reward destination matters (cash off now ≠ points into a programme ≠ credit for later). | ✅ Implemented: cash paid and reward value shown separately everywhere; points never presented as guaranteed cash. |
| 4 | Product-specific denomination and purchase limits cannot always be global offer fields. | ⚠️ Partially: `denomination_note`, `cap_dollars`, `uses_per_customer` are offer-level; per-product limits need `gift_card_products` rows (0 today). |
| 5 | Merchant acceptance differs by product, MCC and channel. | ✅ Modelled (021/022: `gift_card_merchant_acceptance`, `supported_mccs`/`unsupported_mccs`, confidence tiers) but **unpopulated** (0 product rows). |
| 6 | Ongoing membership catalogues (NRMA/RACV-style programmes) differ from temporary promotions. | ❌ Future work — no programme/catalogue entity; legacy rows fake it as long-dated discounts. |
| 7 | Facts, editorial observations, and community comments must remain separate. | ✅ Implemented: only structured facts + bounded excerpt stored; no article prose/comments/images; `gift_card_knowledge` is internal-only. |
| 8 | Missing expiry must not mean "ongoing". | ✅ Implemented: null expiry renders "No end date listed"; approval requires expiry or explicit "ongoing" tick. |
| 9 | Seller and source must never be conflated. | ✅ Implemented: separate columns + view-model labels (§C). |
| 10 | Comments cannot directly drive public rules. | ✅ Implemented by exclusion: comments are never ingested at all. |

## G. Important decisions and rationale

(Concise ADR versions in `docs/DEALSTACK-DECISIONS.md`.)

| Decision | Alternatives | Why chosen | Consequences | Implementing files |
|---|---|---|---|---|
| **Official RSS before HTML parsing** — RSS/Atom only, ever | HTML scraping (rejected outright, even where robots.txt allows, e.g. Finder) | Legal/compliance posture, stability, small honest surface | Some sources are simply unavailable (Finder rejected in migration 017); Costco done via approved-signal path | `lib/monitor/fetchFeed.ts`, `lib/giftcards/parseGcdbFeed.ts`, `supabase/migrations/017_card_source_registry.sql` |
| **Automated ingestion disabled by default** (quadruple gate) | Enabled-by-default with kill switch | An accidental deploy must not fetch anything; each gate is independently auditable | Enabling is a deliberate multi-step human act (env + DB row) | `app/api/cron/gift-card-ingest/route.ts`, `021` source-row defaults |
| **Dual UTC triggers + Sydney-time gate** | One UTC cron adjusted twice a year; sub-daily Vercel cron (plan-prohibited) | GitHub cron can't express DST; the route deciding makes the schedule idempotent by construction | Off-hour invocations are normal and logged as skips | `.github/workflows/gift-card-ingest.yml`, `lib/giftcards/schedule.ts` |
| **Persistent every-other-day guard (≥40h since last non-skipped run)** | In-workflow state, alternating cron lines | Survives redeploys/restarts because state lives in `gift_card_ingest_runs`; 40h tolerates jitter | A manual `?force=1` run still cannot double-fetch within the window | `lib/giftcards/schedule.ts`, `gift_card_ingest_runs` |
| **Service-role-only approval RPC** | Direct table writes from admin actions | One transaction guards state+upsert+link+audit; RLS can stay default-deny; no partial approvals | Schema changes to publish shape require RPC changes (021→022 did exactly this) | `021`/`022` `approve_gift_card_candidate`, `lib/admin/repos/giftCardPipeline.ts` |
| **Public approval boundary** — nothing external auto-publishes | Auto-import with post-hoc moderation | Wrong public data is worse than missing data for a trust product | Human review is the throughput bottleneck, accepted | All staging tables + admin queues; `lib/repos/topDeals.ts` approval join |
| **One shared valuation engine** | Per-surface maths | Card, admin preview, detail page and stack engine must show identical numbers | Any valuation change is one file + its tests | `lib/giftcards/value.ts` |
| **Compatibility status vocabulary (5 statuses)** | Boolean stackable flag, free text | "Stackable" was dishonest; five statuses encode evidence quality | Every surface (cards, detail, stack) speaks the same labels | `lib/giftcards/compatibility.ts`, `stackability.ts` |
| **Source attribution policy** | Bare "source: GCDB" everywhere, or none | Citation honesty; seller ≠ source (§C) | `source_name`/`source_detail_url` columns; view-model hides redundant source | `021`, `offerCardViewModel.ts` |
| **No article prose / comments / images stored** | Keep raw HTML for later re-parsing | Copyright + trust: we republish facts, not content | Bounded ≤280-char excerpt only; re-parse means re-fetch | `parseGcdbFeed.ts`, `noSourceProse.test.ts` |
| **Seller/source separation** | Single "source" field (legacy rows did this) | See §C | Legacy rows (`gc-apple-points` etc.) still conflate — correction backlog | `021` columns, view-model |
| **Honest missing-data fallbacks** | Guess/"Ongoing"/hide the section | Cannot assert what the source didn't state | "No end date listed", "not recorded" rows, absent sections | `offerCardViewModel.ts`, `termsRows.ts`, `claimSteps.ts` |
| **Duplicate detection = advisory verdicts, not auto-reject** | Hard dedupe at ingest | Cross-source/manual overlap needs human judgement; false-positive rejects lose data silently | Admin sees verdicts on the review card and decides | `duplicateDetection.ts` |
| **Card view-model instead of raw JSX interpretation** | Component reads offer fields directly | 33-brand strings, null dates and mechanic variety made JSX-level logic untestable and regression-prone | Every rendered string is unit-tested; component is dumb | `offerCardViewModel.ts` (+ commit `1d7b87a`), `offerCardViewModel.test.ts` |

## H. Known traps and regressions

| Trap | Symptom | Root cause | Permanent safeguard | Regression test |
|---|---|---|---|---|
| Migrations missing from schema manifest | Green drift probe that isn't actually covering new schema | Manifest updated by hand | `tests/admin/schemaManifest.test.ts` fails `test:admin` if a committed migration file isn't in `scripts/schema-manifest.ts` | ✅ that test |
| Stale generated DB types | Type errors or, worse, silently-loose `any` access to new columns | `database.types.ts` only changes via `npm run types:gen` | Regenerate types in the same commit as every migration apply (021: `b541521`; 022: `05d6d00`) | `npx tsc --noEmit` |
| Prod migration drift (hand-applied history) | Ledger says one thing, schema says another; 005 was missing entirely on 2026-07-08 | Migrations historically applied by hand without ledger rows | `npm run verify:schema` probes `information_schema` per column; weekly `schema-drift.yml`; **never trust `list_migrations`** | ✅ manifest self-audit |
| Vitest discovering Playwright specs | Vitest run explodes in an incompatible browser-test runtime | Both suites live under `tests/` | `vitest.config.ts` excludes `tests/e2e/**` | config itself |
| Ambiguous E2E locators | Flaky/false-failing Playwright assertions when copy appears in multiple components | Text-based locators matching >1 node | Prefer role/testid-scoped locators; assert on content present in both static and DB modes | `tests/e2e/public-flows.spec.ts` conventions |
| Render-time `Date.now()` | Time-dependent output drifts between build/render/test; stack tests began failing as real time advanced | Clock read inside pure logic | Injectable `now` param (stack engine `buildStackRecommendations(…, now)`, gift-card compat/schedule take `now`); tests pass fixed `TEST_NOW` | ✅ `tests/stack/factories.ts` pattern |
| Old `/deals` gift-card experience vs `/gift-cards` | Two surfaces showing gift cards with different rules | Gift cards predated the dedicated page | `/gift-cards` (+ detail) is the gift-card surface; `/deals` shows deal signals/stacks. Don't re-grow a parallel gift-card UI in `/deals` | e2e covers both pages |
| Long raw brand lists stretching grid rows | 500+-char, 33-brand `brand` string blew up card layout | Rendering the raw DB string | View-model splits to `brandPrimary` + "+N more" | ✅ `offerCardViewModel.test.ts` |
| Missing expiry displayed as "Ongoing" | Implied evergreen offers we couldn't verify | Optimistic fallback label | "No end date listed" fallback; approval requires expiry or explicit ongoing tick | ✅ view-model + `approvalValidation` tests |
| Generic "Stackable" label | Overclaimed compatibility | Boolean flag | Five-status vocabulary (§B compatibility) | ✅ `compatibility.test.ts` |
| Points offers showing "See offer for price" | Points mechanics forced through discount-shaped display | One display path for all mechanics | Mechanic-driven view-model labels/badges; points valued via disclosed cents-per-point, cash and points kept separate | ✅ view-model + `value.test.ts` |
| Compound Amazon campaign flattened | One row pretending to be one offer (33 brands, one value) | Extractor emits one candidate per feed item | Known limitation — documented here and §F1; fix is Phase 6 (§K) | ❌ none yet |
| Local static fixtures failing to reproduce prod-shaped data | Visual regressions invisible locally; "works with fixtures" ≠ works with prod rows | Synthetic fixtures are tidier than reality (committed OzB fixtures are synthetic too — real feed has `ozb:meta` expiry markers) | Use prod-shaped rows (long brand lists, null dates, 0% + points) when checking UI; verify real feed shape before concluding a field doesn't exist | partial — view-model tests encode the ugly shapes |
| Sensitive Vercel env vars unreadable | `vercel env pull` returns empty for sensitive vars → looks unset | Vercel masks sensitive values | Treat empty-on-pull as "present but masked"; verify via behaviour (route responses), not pulls | n/a |
| Cron runs stuck as `running` after exceptions | One-running lock never released → all future runs skip | Exception path skipped finalisation | `runGuarded.ts` invariant: thrown ingest always `fail()`s the run | ✅ `runGuarded.test.ts` |
| `?force=1` security expectations | Assumed to bypass everything | It bypasses ONLY the Sydney-run-hour gate | Auth, env flag, DB gates and the 40h interval guard all still apply — by design | ✅ `giftCardIngestRoute.test.ts` / `schedule.test.ts` |
| Node 20 requirement | Node 15 default shell → mysterious tool failures; Node 20 lacks native WebSocket for supabase-js scripts | nvm default + supabase-js needs | `nvm use 20` for lint/build/test; Node 22 for `npm run seed` + schema-drift workflow (pinned in the workflow) | workflow comment documents the reproduced crash |
| Dev-server CSP/nonce noise | Console CSP violations in dev that don't reproduce in prod builds | Nonce-based CSP-Report-Only + dev tooling | Ignore in dev; validate CSP against production builds/deploys only | n/a |
| Turbopack worker panic | `next dev` panics; cache poisoned afterwards | PATH resolving to old Node | zsh `-c` PATH-prefix to Node 20; `rm -rf .next/dev` after any panic | n/a |
| Full `npm run seed` failing on signals | Unique-violation on `ozbargain_signals.source_native_id` | Prod ids diverged from seed data | Seed skips+reports divergent rows; insert new signals individually | seed script behaviour |

## I. Current uncommitted changes

**None.** At handoff time `git status` is clean, `main` is even with `origin/main` at `1d7b87a`, and `git diff --check` is empty. The most recent work (gift-card view-model refactor, 022 detail fields + acceptance model, type regeneration) is already committed and pushed as `7bd3b12` → `1d7b87a`. The five `docs/OPUS-4.8-*` / `docs/DEALSTACK-DECISIONS.md` / `docs/RECOMMENDED-AUTOMATIONS.md` files created by this handoff task are the only new untracked files, are documentation-only, depend on no migration, and are ready to commit once the user approves the handoff (Phase 1, §K).

## J. Production-data correction backlog

Source: `docs/gift-card-offer-corrections-2026-07-12.md`, re-verified against live rows 2026-07-12 *(prod-verified)*. Legend: mechanics are `discount` / `points` / `bonus`; "022 fields" = promo_code, expiry_time/timezone, uses_per_customer, caps, terms_url, included_product_ids — **all columns now exist in prod**, so no correction below is migration-blocked; each needs source re-verification then an audited admin edit.

**Systemic gaps across all 9 GCDB rows:** no linked products (PROD/MCC), no `terms_url`, `format='unknown'`, `confidence='needs-verification'`.

| Offer ID | Seller | Source | Current mechanic | Correct mechanic | Current dates | Verified dates | Missing fields | Dup risk | Compound risk | Proposed action | Confidence | Evidence needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gc-tcn-love-tcn-shop-tcn-cinema-tcn-good-food-card-gift` | Card.Gift | GCDB | discount 10% | ✔ same | exp 2026-07-17 | need time: owner says 11:59 PM AEST | CODE (FEELING10?), CAP ($3,000?), uses=1?, TERMS, PROD | low | medium (4 TCN cards) | **Flagship**: verify each term at gcdb.com.au/offer/12870 + Card.Gift terms, then audited edit | med | offer/12870 + seller terms page |
| `gc-amazon-ultimate-active-wellness-…` (33 brands) | Amazon (campaign seller unclear) | GCDB | discount 10% | ✔ likely | exp **2026-07-13** (imminent) | verify | CAP (per-account?), PROD, TERMS | low | **high — flattened compound campaign** | Verify at offer/12680; consider splitting when compound support lands; may simply lapse 07-13 | low | offer/12680 |
| `gc-apple-big-w` | Big W | GCDB | points 20× Everyday Rewards | ✔ same | **no expiry** | weekly catalogue promos end — verify | EXP, TERMS, PROD | **overlaps `gc-apple-points`** (same brand, diff seller) | low | Verify end date at offer/12783; re-approve as ongoing only if genuinely so | med | offer/12783 |
| `gc-apple-coles` | Coles | GCDB | points 20× Flybuys | ✔ same | **no expiry** | verify | EXP, TERMS, PROD | low | low | Verify at offer/12540 | med | offer/12540 |
| `gc-luxury-escapes-event-cinemas-village-cinemas-coles` | Coles | GCDB | points 20× Flybuys | ✔ same | **no expiry** | verify | EXP, TERMS, PROD | low | low | Verify at offer/12386 | med | offer/12386 |
| `gc-restaurant-choice-uber-uber-eats-coles` | Coles | GCDB | discount 10% | ✔ same | **no expiry** | weekly % promos usually capped+dated | EXP, CAP, TERMS | low | low | Verify at offer/12676 | med | offer/12676 |
| `gc-tcn-baby-tcn-gift-tcn-teen-tcn-deluxe-the-holiday-hotel-wool` | Woolworths | GCDB | points 20× Everyday Rewards | ✔ same | **no expiry** | verify | EXP, TERMS, PROD | low | medium (5 cards) | Verify at offer/12677 | med | offer/12677 |
| `gc-uber-uber-eats-harris-farm-ultimate-active-wellness-giftz-co` | Giftz.com.au | GCDB | discount 10% | ✔ same | **no expiry** | verify | EXP, CAP, TERMS, PROD | low | medium | Verify at offer/12716 | med | offer/12716 |
| `gc-amazon-airbnb-accor-hotels-autobarn-bunnings-warehouse-qanta` | Qantas Marketplace | GCDB | points 3× Qantas | ✔ same | **no expiry** | verify | EXP, TERMS, PROD | low | medium (truncated 64-char id is cosmetic only) | Verify at offer/12551 | med | offer/12551 |
| `gc-apple-points` | Woolworths | "Woolworths in-store promo" (root-URL citation) | **discount 0%** | **points/bonus (mis-typed)** | 2026-06-08 → 2026-07-24 | verify | PRG re-type, TERMS; remove "Sample:" prose | **HIGH — fresh Woolworths Apple 20× candidate (conf 0.85) in queue duplicates this; `gc-apple-big-w` overlaps** | low | **Either** approve the fresh candidate AND unpublish this, **or** reject candidate as dup — never both published | high (that it's wrong) | queue candidate + Woolworths catalogue |
| `gc-coles-group-bonus-points` | Coles | "Coles in-store promo" (root-URL citation) | **discount 0%** | **points/bonus (mis-typed)** | 2026-06-08 → 2026-09-30 | verify | PRG re-type, TERMS; remove "Sample:" prose | low | low | Re-type via audited edit or unpublish pending re-verification | high (that it's wrong) | Coles/Flybuys source |
| `gc-restaurant-cafe-choice` | NRMA Blue | NRMA | discount 10% | ✔ (really a **membership programme** — see §F6) | 2026-06-01 → 2026-07-31 | last_checked 2026-05-20 = **stale (>21d)** | TERMS; "(sample)" in limit_per_customer | low | low | Re-verify or downgrade confidence; candidate for programme/catalogue entity later | med | NRMA Blue benefits page |
| `gc-ultimate-jbhifi` | RACV Member Benefits | RACV | discount 5% | ✔ (programme-like) | 2026-06-01 → **2026-07-15 (3 days)** | verify | TERMS; "(sample)" prose | low | low | Re-verify by 07-15 or let RLS hide it at expiry | med | RACV benefits page |

**Categorised:**
- **Code fixes:** none required — display layer already handles every current shape honestly.
- **Migration-dependent corrections:** none remaining (022 is applied).
- **Safe production updates (after row-level approval):** expiry/CODE/CAP/TERMS fills on the 9 GCDB rows via the audited admin edit UI.
- **Rows to unpublish:** `gc-apple-points` (if the fresh candidate is approved instead); `gc-amazon-ultimate-…` and `gc-ultimate-jbhifi` self-resolve at expiry if not re-verified.
- **Rows to split:** `gc-amazon-ultimate-…` (compound campaign) — blocked on Phase 6 architecture.
- **Rows to become programme/catalogue entries:** `gc-restaurant-cafe-choice` (NRMA), `gc-ultimate-jbhifi` (RACV) — blocked on Phase 7/§O decision.

## K. Exact next phases

All commands assume `nvm use 20` first unless noted. **Stop gates in bold.**

### Phase 1 — Review and commit this handoff (local docs only)
- **Prereqs:** user has read the handoff. **Requires user approval of content, then git is autonomous (standing memory rule).**
- Commands: `git add docs/OPUS-4.8-HANDOFF.md docs/OPUS-4.8-HANDOFF.json docs/DEALSTACK-DECISIONS.md docs/OPUS-4.8-START-PROMPT.md docs/RECOMMENDED-AUTOMATIONS.md && git commit && git push`
- Files: the five handoff docs. Tests: none needed (docs-only); run `npm run lint` if anything else was touched. Rollback: `git revert`. Consider also fixing the stale line in `docs/gift-card-pipeline.md` here.

### Phase 2 — Apply pending migration
- **Not applicable — there is no pending migration.** 021 and 022 are applied and verified. If a future migration 023 exists: review SQL → user approves → apply via Supabase MCP/dashboard → immediately Phase 3. **Hard gate: explicit user approval per migration.**

### Phase 3 — Regenerate types (only after any future migration)
- Commands: `npm run types:gen` (writes `lib/supabase/database.types.ts`), then `npx tsc --noEmit`, commit types together with the migration reference. Currently types are in sync with prod (022 columns present).

### Phase 4 — Validate production schema
- **Prereqs:** service-role env available locally (`.env.local`) — read-only.
- Commands: **Node 22** → `npm run verify:schema`; or trigger `.github/workflows/schema-drift.yml` via manual dispatch. Also `tests/admin/schemaManifest.test.ts` runs in `npm run test:admin`.
- Safety: read-only by construction. No approval needed.

### Phase 5 — Correct approved records (§J backlog)
- **Prereqs: explicit row-level user approval of each correction** + source re-verification at the cited URL on the day of the edit.
- Method: audited admin edit UI (`/admin/gift-cards`), **never raw SQL**, so every change lands in `audit_log`. Resolve the Apple/Woolworths duplicate per §J. Re-run `/gift-cards` visually with the corrected rows.
- Tests: `npm run test:giftcards`; smoke against prod: `npm run smoke -- --base-url=https://dealstack-au.vercel.app`.
- Rollback: audit log records prior values; edits are individually reversible.

### Phase 6 — Compound-offer architecture
- **Prereqs: user decision (§O) — relational sub-offer tables vs JSON-first.**
- Likely files: new migration 023, `lib/giftcards/extractOffer.ts` (emit multiple sub-offers), `duplicateDetection.ts`, review UI, `offerCardViewModel.ts`, `schema-manifest.ts`, types regen.
- Tests: `test:giftcards` + `test:admin` (manifest). Keep it staged/additive; nothing auto-splits published rows.

### Phase 7 — Product and merchant knowledge
- **Prereqs:** Phase 5 done (know which offers stay). Create `gift_card_products` + `gift_card_merchant_acceptance` rows for TCN / Ultimate / Apple families (admin UI or reviewed seed script), link via `product_id` / `included_product_ids`.
- Tests: `test:giftcards` (acceptanceModel), visual check of detail pages. No migration needed — tables exist and are empty.
- **Gate:** acceptance facts need cited evidence; do not bulk-invent MCC lists.

### Phase 8 — Controlled recurring-ingestion activation
- **Prereqs: explicit user approval; Phases 5–7 recommended first** so review throughput and data shape are proven.
- Steps: confirm robots/terms and stamp `terms_checked_at`/`robots_checked_at` on the source row → set `GCDB_INGEST_ENABLED=true` + `GCDB_REQUEST_USER_AGENT` in Vercel → `update gift_card_sources set enabled=true, automated_fetch_allowed=true where id='gcdb'` (via MCP with approval) → watch `gift_card_ingest_runs` for two scheduled runs → review candidates.
- Rollback: flip any single gate off — all four must be open to fetch. The GitHub workflow needs no change (already firing daily into closed gates).

## L. Validation runbook

Full gate, in order, on **Node 20** (`nvm use 20`):

```bash
npm run lint            # ESLint — zero tolerance
npx tsc --noEmit        # type-check (catches stale database.types.ts)
npm run test:giftcards  # 173 tests — gift-card parsing/extraction/valuation/view-models/route gates
npm run test:stack      # 235 tests — stack engine, compatibility, presentation
npm run test:admin      # 174 tests — rate limits, audit, readiness gates, schema manifest self-audit
npm run test:monitor    # 302 tests — feed parsing, ranking, pipeline, recheck
npm run test:deals      # 14 tests  — deals discovery
npx vitest run          # all of the above at once: 898 tests / 88 files (excludes e2e by config)
npm run build           # production build — must pass before any commit
npm run test:e2e        # 40 Playwright tests (chromium + mobile), needs the build; static-fallback data
npm run smoke -- --base-url=<url>   # route/SEO/security-header smoke; add --strict-content against prod
git diff --check        # no whitespace/conflict-marker damage
```

Authoritative suite per subsystem: gift-card pipeline/display → `test:giftcards`; stack/valuation maths → `test:stack`; admin actions/rate-limits/manifest → `test:admin`; feed monitor/ranking/recheck/top-deals → `test:monitor`; public deals discovery → `test:deals`; cross-page rendering/navigation → `test:e2e`; deployed-site trust → `smoke --strict-content`. Schema truth → **Node 22** `npm run verify:schema`.

## M. Environment and operational runbook

Reference: `.env.example` (authoritative, no real values) and README §"Required Vercel environment variables".

| Variable | Scope | Required | Default | Prod | Failure behaviour |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | yes | — | set | unset → static-fallback data locally; public pages fail closed on errors |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | yes | — | set | as above (RLS-limited key, safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server/script only** | yes (admin/scripts) | — | set | admin repos/scripts fail; NEVER `NEXT_PUBLIC_`, never log |
| `NEXT_PUBLIC_SITE_URL` | server (build) | prod-required | `http://localhost:3000` | set | silent fallback breaks sitemap/canonical/OG/JSON-LD — launch-critical |
| `CRON_SECRET` | server | yes for all cron/health | — | set | routes return 503 and never run; GitHub workflows exit 2 "blind" without the matching Actions secret |
| `DATA_SOURCE` | server | no | `supabase` | unset | `static` forces fallback dataset (used by Playwright webServer) |
| `OZB_MONITOR_ENABLED` | server | no | off | per ops | off → monitor route no-ops safely |
| `OZB_MONITOR_USER_AGENT` | server | when monitor on | — | per ops | monitor fails closed without an identifying UA |
| `OZB_MONITOR_MAX_FEEDS_PER_RUN` / `OZB_MONITOR_MIN_INTERVAL_HOURS` | server | no | 10 / 12 | unset | caps only |
| `SIGNAL_VALIDATION_DAYS` | server | no | 45 | unset | validation cadence |
| `CARD_DETECT_ENABLED` | server | no | off | off | card-detection assist stays dark |
| `OZB_OFFER_DETECT_ENABLED` | server | no | off | **off** | detection stays dark; preview panel works regardless |
| `OZB_EXPIRY_RECHECK_ENABLED` | server | no | off | per ops | recheck route no-ops |
| `OZB_EXPIRY_RECHECK_DRY_RUN` | server | no | **true (preview)** | per ops | anything but exactly `"false"` = preview: classifies, writes nothing |
| `OZB_EXPIRY_RECHECK_BATCH_SIZE` / `…_MIN_INTERVAL_HOURS` | server | no | 40 (25–50) / 20 | unset | clamped |
| `GCDB_INGEST_ENABLED` | server | no | **off** | **off** | gate 2 of 4; off = no DB read, no network |
| `GCDB_RSS_URL` | server | no | DB source row value | unset | env only overrides the row |
| `GCDB_REQUEST_USER_AGENT` | server | **required when ingest on** | — | unset | route **throws (fails closed)** if enabled without it |
| `GCDB_MAX_ITEMS_PER_RUN` | server | no | 40 | unset | per-run cap |
| `ALERT_WEBHOOK_URL` | server | no | — | optional | unset → errors still logged as `[server-error]` lines |

Admin access has **no env var** — solely the `admins` table + hand-created Supabase Auth users.

**Operational recipes:**
- **One controlled local/manual ingest against prod, safely:** all four gates must be opened deliberately (env flag + UA in Vercel, both booleans on the `gcdb` source row), then `curl -H "Authorization: Bearer $CRON_SECRET" "https://dealstack-au.vercel.app/api/cron/gift-card-ingest?force=1"` (force skips only the 7am-Sydney hour gate; the 40h guard still applies). Immediately re-close the source-row gates afterwards. This exact procedure was used for the 2026-07-12 test run.
- **Restore source gates:** `update gift_card_sources set enabled=false, automated_fetch_allowed=false where id='gcdb';` — verify with a SELECT. (Read-only verify: both were `false` on 2026-07-12.)
- **Verify no public data changed:** compare `select md5(string_agg(id || coalesce(updated_at::text,''), ',' order by id)) from gift_card_offers;` before/after (the 021/022 applies were verified offer-hash-identical this way); plus `npm run smoke -- --base-url=<prod> --strict-content`.
- **Inspect ingest-run history:** `select * from gift_card_ingest_runs order by started_at desc limit 10;` (service-role; or the `/admin/gift-cards` ops surface).
- **Enable recurring ingestion (only after §K Phase 8 approval):** see Phase 8 — env flag + UA, then DB row gates, then watch two scheduled runs.

## N. Working style that was effective

- **Inspect first, always:** `git status` / `git log` / read the actual files before believing any summary — including this one. Verify prod claims via read-only `information_schema` queries, not the migration ledger.
- **Concise plan before code**, then implement exactly one bounded phase; the repo's `/phase` skill encodes the full ritual (scope → implement → lint/build/tests → commit → push → stop).
- **Reuse existing infrastructure:** the gift-card pipeline deliberately mirrored the OzBargain monitor's gates/locks/staging pattern; `AdminListTable` has a reusable `bulk` prop; valuation lives in exactly one module. Look for the existing pattern before inventing one.
- **One phase at a time; run the focused suite after each phase**, full gate before commit (§L).
- **Use real production-shaped data for visual work:** long brand lists, null dates, 0%-points rows. Synthetic fixtures hide the bugs that matter (this produced the view-model refactor).
- **Never claim completion before the full validation gate is green.** Report failures verbatim.
- **Git is autonomous through to `origin/main` for routine commits (standing user preference), but never commit/push mid-task or without the gate passing.**
- **Production is sacred:** no migration, data write, RLS change, or feature-flag flip without explicit user approval, and use the audited admin paths (not raw SQL) for data corrections.
- **Prefer pure, dependency-injected helpers** (`runIngest`, `runGuarded`, `schedule`, view-models) — every hard bug here was caught by a unit test on a pure function.
- **Preserve trust boundaries mechanically**, not by convention: RLS default-deny, service-role-only RPCs, property-access traps in tests.
- **Report incomplete facts honestly** — "not recorded" beats a guess, in UI and in status reports alike. Australian spelling in all user-facing copy.

## O. Questions Opus must ask before proceeding

1. **Row-level approval for the §J correction pass** — which of the 13 published gift-card offers to correct/unpublish, per row, after source re-verification? (Includes the Apple-at-Woolworths duplicate decision: approve the fresh queue candidate + unpublish `gc-apple-points`, or reject the candidate?)
2. **The 15 `new` candidates in the review queue** — review now, or leave staged? (They expire naturally; no cost to waiting.)
3. **Compound campaigns (Phase 6):** new relational sub-offer tables, or JSON-first inside the existing candidate/offer shape? (Relational is cleaner; JSON ships without a migration.)
4. **Programme/catalogue support (NRMA/RACV-style ongoing member benefits):** in scope for the next release, or keep modelling them as long-dated offers?
5. **When may recurring GCDB ingestion be activated (Phase 8)?** All gates are currently closed; the schedule infrastructure is live and no-oping daily.
6. *(Minor, standing ops from the launch checklist)* — confirm the GitHub Actions secrets (`CRON_SECRET`, schema-drift pair) are all in place, and whether `OZB_OFFER_DETECT_ENABLED` / `OZB_EXPIRY_RECHECK_ENABLED` should ever go live — these are human/ops calls, not code.

*Not questions (already answered by the repo):* whether to apply 021/022 (done), whether HTML scraping is acceptable (never), whether anything may auto-publish (never), Vercel cron frequency (daily max), whether to trust the migration ledger (no — probe).
