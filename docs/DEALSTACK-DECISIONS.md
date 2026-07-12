# DealStack AU — Architectural Decision Record

> ADR-style log of the load-bearing decisions, distilled 2026-07-12. Operational
> detail lives in `docs/OPUS-4.8-HANDOFF.md`; this file records *why* things are
> the way they are so future changes don't accidentally reverse a deliberate
> choice. Status legend: **Accepted** = in force; **Standing rule** = also a
> CLAUDE.md hard constraint.

---

## ADR-1: RSS/Atom feeds only — no HTML scraping, ever

- **Context:** Deal data lives on many sites; most have no API. Scraping was repeatedly tempting (Finder card offers, Costco Hot Buys, GCDB article pages).
- **Decision:** Only official RSS/Atom feeds (plus status-only HEAD probes for deletion checks) may be fetched. A Cloudflare/login/non-XML response aborts the run as `blocked`. Sources without feeds are rejected outright (Finder — recorded in migration 017) or handled via compliant manual paths (Costco via approved signals).
- **Consequences:** Smaller source pool; zero robots/ToS exposure; parsers are stable against structured XML instead of brittle HTML.
- **Status:** Standing rule.
- **Files:** `lib/monitor/fetchFeed.ts`, `lib/giftcards/parseGcdbFeed.ts`, `supabase/migrations/017_card_source_registry.sql`, `lib/monitor/validateSourcePost.ts`.

## ADR-2: Nothing external auto-publishes — staged review with a single approval RPC

- **Context:** A trust product showing wrong offers is worse than one showing fewer offers.
- **Decision:** All ingested data lands in service-role-only staging tables (RLS default-deny). The only path to a public table is an admin-reviewed, `security definer`, service-role-only RPC (`approve_gift_card_candidate`, `approve_feed_item`, …) that guards state, upserts from **admin-edited** values, links the candidate, and writes the audit row in one transaction. Material changes to approved offers re-stage a `changed` candidate; they never rewrite the public row.
- **Consequences:** Human review is the throughput ceiling (accepted); every publication is audited; RLS stays default-deny everywhere private.
- **Status:** Standing rule.
- **Files:** `supabase/migrations/021/022` (RPC), `lib/admin/repos/giftCardPipeline.ts`, `lib/giftcards/approvalValidation.ts`, `lib/repos/topDeals.ts`.

## ADR-3: Automated ingestion is off by default behind independent gates

- **Context:** An accidental deploy or misconfiguration must not cause outbound fetching.
- **Decision:** Four independent gates for gift-card ingest — `CRON_SECRET` bearer, `GCDB_INGEST_ENABLED` env flag, `gift_card_sources.enabled`, `gift_card_sources.automated_fetch_allowed` — all default closed; an identifying `GCDB_REQUEST_USER_AGENT` with contact URL is required (fails closed). The OzBargain monitor uses the same pattern (env flag + compliance review row + source row).
- **Consequences:** Enabling is a deliberate multi-step human act across two systems; a single gate flip disables everything; scheduled triggers can fire safely into closed gates forever.
- **Status:** Accepted; recurring gift-card ingestion has never been enabled.
- **Files:** `app/api/cron/gift-card-ingest/route.ts`, `.env.example`, migration 021 defaults.

## ADR-4: Dual UTC triggers + in-route Sydney-time gate + persistent 40-hour guard

- **Context:** GitHub cron is UTC-only and cannot express "7am Australia/Sydney" across DST; Vercel Hobby allows only daily crons; runs must be every-other-day.
- **Decision:** The workflow fires daily at both possible UTC equivalents (20:00, 21:00); the route accepts only when it is currently the 7 o'clock hour in Australia/Sydney (pure `Intl`, no fixed offsets) AND the last non-skipped run started ≥40h ago (state in `gift_card_ingest_runs`, so it survives deploys). `?force=1` bypasses only the run-hour gate.
- **Consequences:** Idempotent by construction; off-hour invocations are normal, machine-readable skips; no schedule edits at DST changes.
- **Status:** Accepted.
- **Files:** `.github/workflows/gift-card-ingest.yml`, `lib/giftcards/schedule.ts`, `tests/giftcards/schedule.test.ts`.

## ADR-5: One-running locks with guaranteed finalisation

- **Context:** A crashed run that stays `running` blocks every future run (this class of bug previously cost real time).
- **Decision:** Unique partial index enforces one `running` ingest; a pure orchestration envelope (`runGuarded.ts`) guarantees a thrown ingest always finalises the run as `error` (releasing the lock), and observability failures can never block or mask finalisation. Daily pipeline (016) and recheck (020) use equivalent locks.
- **Consequences:** No stuck locks; provable in unit tests with injected deps.
- **Status:** Accepted.
- **Files:** `lib/giftcards/runGuarded.ts`, `tests/giftcards/runGuarded.test.ts`, migrations 016/020/021.

## ADR-6: One shared valuation engine

- **Context:** Bonus-value percentages, points multipliers and discounts have different maths; showing different numbers on the card vs detail vs stack engine destroys trust.
- **Decision:** All valuation formulas live in `lib/giftcards/value.ts` (effective saving, bonus `10/(100+10)`, disclosed cents-per-point defaults, worked examples). Every surface imports it.
- **Consequences:** A valuation change is one file + one test suite; cash paid and reward value are separated everywhere — points are never presented as guaranteed cash.
- **Status:** Accepted.
- **Files:** `lib/giftcards/value.ts`, `tests/giftcards/value.test.ts`, `workedExample.test.ts`.

## ADR-7: Five-status compatibility vocabulary

- **Context:** A generic "Stackable" label overclaimed what the data supported.
- **Decision:** One shared vocabulary — `compatible` / `likely-compatible` / `incompatible` / `requires-verification` / `insufficient-evidence` — used by offer cards, detail-page stackability (two-stage: acquisition vs redemption) and the stack engine.
- **Consequences:** Evidence quality is visible in the label; new surfaces must map to these five, not invent labels.
- **Status:** Accepted.
- **Files:** `lib/giftcards/compatibility.ts`, `lib/giftcards/stackability.ts`, `lib/stack/compatibility.ts`.

## ADR-8: Seller ≠ source, and citation honesty

- **Context:** Legacy rows conflated "where you buy the card" with "who told us about the offer", breaking attribution.
- **Decision:** Seller (purchase location) and source (`source_name` + `source_detail_url`) are distinct fields; the card view-model shows the source only when it adds information. Root-URL citations are a recorded data-quality defect.
- **Consequences:** Legacy rows (`gc-apple-points`, `gc-coles-group-bonus-points`) are in the correction backlog; approval requires a real source URL.
- **Status:** Accepted.
- **Files:** migration 021 columns, `lib/giftcards/offerCardViewModel.ts`, `approvalValidation.ts`.

## ADR-9: No article prose, images or comments are stored

- **Context:** GCDB articles contain editorial prose, images and community comments — content we have no right to republish and no basis to treat as fact.
- **Decision:** Only structured extracted facts plus a bounded ≤280-char factual excerpt are persisted; comments are never ingested; `gift_card_knowledge` is internal-only; the public detail page provably never touches raw payloads (property-access trap test).
- **Consequences:** Re-parsing means re-fetching; public pages can only ever render reviewed, structured fields.
- **Status:** Standing rule.
- **Files:** `lib/giftcards/parseGcdbFeed.ts`, `tests/giftcards/noSourceProse.test.ts`.

## ADR-10: Honest missing-data fallbacks — absence is never inferred

- **Context:** Extractors frequently find no end date; sources omit terms. Guessing ("Ongoing", invented expiries) misleads users.
- **Decision:** Missing expiry renders "No end date listed"; terms rows say "not recorded"; detail sections appear only when their data exists; approval demands an expiry date or an explicit "ongoing" tick; card offers without an issuer-stated fixed expiry stay unpublished rather than receiving an invented date.
- **Consequences:** Sparse-looking pages for thin data — accepted as the honest outcome; extraction warnings surface to the reviewing admin.
- **Status:** Accepted.
- **Files:** `offerCardViewModel.ts`, `termsRows.ts`, `claimSteps.ts`, `approvalValidation.ts`, `lib/offers/cardReadiness.ts`.

## ADR-11: Duplicate detection advises; humans decide

- **Context:** The same promotion appears across source pages, sellers and manual entries; hard dedupe at ingest would silently drop real variants.
- **Decision:** Pure, deterministic verdicts (`exact-duplicate` / `probable-duplicate` / `overlapping-campaign`) are surfaced on the review card; nothing is auto-rejected.
- **Consequences:** The reviewer carries the dedupe responsibility (e.g. the standing Apple-at-Woolworths conflict must be resolved by approve-and-unpublish or reject — never both published).
- **Status:** Accepted.
- **Files:** `lib/giftcards/duplicateDetection.ts`.

## ADR-12: Pure view-models instead of raw JSX interpretation

- **Context:** Production-shaped rows (33-brand strings, null dates, 0%-discount points offers) produced layout blowouts and dishonest labels when components read raw fields.
- **Decision:** Every string a card renders is derived in a pure, unit-tested view-model (`brandPrimary` + "+N more", mechanic-driven badges, seller/source/trust separation). Components stay dumb.
- **Consequences:** UI regressions become unit-test failures; new offer mechanics start in the view-model.
- **Status:** Accepted (commit `1d7b87a`).
- **Files:** `lib/giftcards/offerCardViewModel.ts`, `tests/giftcards/offerCardViewModel.test.ts`.

## ADR-13: Schema truth is probed, never assumed

- **Context:** Prod migrations were historically hand-applied; the Supabase ledger is partial (005 was silently missing until 2026-07-08).
- **Decision:** A self-auditing manifest (`scripts/schema-manifest.ts` — adding a migration without updating it fails `test:admin`) plus a read-only per-column probe (`npm run verify:schema`, weekly via `.github/workflows/schema-drift.yml`, Node 22). Generated types are regenerated in the same commit as every migration apply.
- **Consequences:** Drift is detected mechanically; `list_migrations` output is explicitly untrusted.
- **Status:** Accepted.
- **Files:** `scripts/schema-manifest.ts`, `scripts/verify-schema.ts`, `tests/admin/schemaManifest.test.ts`, `.github/workflows/schema-drift.yml`.

## ADR-14: Injectable clocks in all pure logic

- **Context:** Render-time/test-time `Date.now()` made stack tests drift into failure as real time advanced.
- **Decision:** Time-dependent pure logic takes a `now` parameter (stack engine, gift-card compatibility, schedule guards); tests pass a fixed `TEST_NOW`. `Date.now()` is acceptable only at request-handling edges.
- **Status:** Accepted.
- **Files:** `lib/stack/buildStack.ts`, `lib/giftcards/schedule.ts`, `tests/stack/factories.ts`.

## ADR-15: Fail-closed public reads and URL trust

- **Context:** Demo/fallback rows leaking into production, and unvetted URLs rendering publicly, are trust failures.
- **Decision:** Configured Supabase is authoritative — empty/error reads render empty, never demo data; expired rows are suppressed at read time; one URL policy (allowlist, manual same-host redirects, 3-hop cap, bounded bodies) is enforced at admin writes, public reads, final renders and egress; strict smoke (`--strict-content`) catches placeholder leakage on prod.
- **Status:** Standing rule.
- **Files:** `lib/security/urlPolicy.ts`, `lib/repos/sourceResults.ts`, `lib/offers/cardReadiness.ts`, `scripts/smoke-routes.ts`.
