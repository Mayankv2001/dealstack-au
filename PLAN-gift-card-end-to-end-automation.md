# PLAN — Gift-card end-to-end automation programme

> Programme plan authored 2026-07-15 by the engineering-manager agent after full
> repository discovery. **No code, migration, commit, push, data change, or
> ingestion enablement has been performed.** Companion task files:
> `tasks/gift-card-automation/TASK-*.md`. Related prior plan:
> `PLAN-gift-card-future-improvements.md` (Phases 1–6 remain valid; this
> programme absorbs and extends its Phases 2–5).

---

## 1. Objective

Build a production-safe, end-to-end gift-card intelligence system that:

1. Imports active gift-card offers from approved sources (GCDB, Point Hacks
   weekly, retailer pages linked by them) through the existing staged,
   admin-reviewed pipeline.
2. Makes newly **approved** weekly offers publicly visible by ~07:00
   Australia/Sydney, DST-correct, without weakening the approval boundary.
3. Runs a daily reconciliation comparing DealStack canonical offers with
   approved source data — detecting new / changed / expired / withdrawn /
   missing offers.
4. Archives expired offers out of active surfaces while preserving history.
5. Models the gift-card product catalogue and **merchant acceptance** ("where
   can this card be spent?") as reviewed structured data — never hard-coded
   lists.
6. Ingests GCDB **predictions** as a strictly isolated, never-public-actionable
   record type with outcome reconciliation.
7. Connects acceptance + active offers to store/product search and the
   purchase planner (Nike → TCN Shop and TCN Love, when evidence supports it).
8. Explains stack compatibility through the existing five-status engine.
9. Preserves every existing approval, evidence, trust, freshness, and
   compatibility boundary.

**Explicit confirmations required by the brief:**

- **Predictions will never be used as live offers.** They live in an isolated
  table, are excluded from every active/public/planner/search surface by
  schema-level status, and can only become offers via the normal candidate →
  admin review → approve RPC path with real source evidence.
- **Gift-card acceptance will be stored as reviewed structured data**
  (`gift_card_merchant_acceptance` + staged candidates + audit), never as
  hard-coded merchant lists in components or planner rules.
- **Fully automatic public appearance of new offers is NOT permitted** by
  DealStack's standing approval policy ("nothing external auto-publishes").
  The 07:00 workflow therefore: (a) ingests and stages candidates for admin
  review, (b) **activates already-admin-approved future-dated offers** whose
  confirmed start date has arrived, and (c) archives expired offers. Only
  (b) and (c) touch public visibility, and both act exclusively on
  admin-approved data. The approval boundary is not weakened.

---

## 2. Current state (verified by repository inspection, 2026-07-15)

The system is far more mature than a greenfield build. Reuse is the default.

### Already implemented and tested
| Area | Implementation |
|---|---|
| Source registry | `gift_card_sources` (021) with quadruple gates (`enabled`, `automated_fetch_allowed`, env flag, UA required); `html` source type + Point Hacks row registered **disabled** (027) |
| Ingestion engine | `lib/giftcards/runIngest.ts` (DI orchestrator), `runGuarded.ts` (lock/finalise), raw items dedupe on `(source_id, external_id)`, content-hash change staging |
| GCDB adapter | `parseGcdbFeed.ts` (RSS), `extractOffer.ts`, route `app/api/cron/gift-card-ingest` |
| Point Hacks adapter | `pointHacksWeekly.ts` (724-line HTML parser), `fetchEditorialPage.ts` (bounded, identifying, conditional, anti-bot **non**-bypass), route `app/api/cron/gift-card-weekly-ingest` |
| Scheduling | `lib/giftcards/schedule.ts` — Sydney 7am hour gate via `Intl` + IANA zone (DST-safe by construction), 40h interval guard, dual-UTC GitHub workflow `gift-card-ingest.yml` (20:00 + 21:00 UTC) |
| Canonical offers | `gift_card_offers` with 022 detail columns; 023 (authored) adds `start_date`, `is_ongoing`, `reward_destination`, fixed-mechanic fields, `source_present`/`source_removed_at`, compound-campaign sub-offers |
| Change classification | `classifyChange.ts` (ingest-time material/non-material), `duplicateDetection.ts` (advisory verdicts) |
| Approval | `/admin/gift-cards/review`, `approvalValidation.ts`, service-role `approve_gift_card_candidate` RPC (extended in 023), full audit |
| Products & acceptance | `gift_card_products` + `gift_card_merchant_acceptance` tables (021; **0 rows in prod**), `acceptanceModel.ts`, `searchAcceptance.ts`, `/gift-cards/where-to-use`, `/gift-cards/where-to-buy`, `/gift-cards/products` |
| Programmes | 024 (authored): `gift_card_programmes` / `_rates` / `_rate_history`, `programmeRates.ts`, `/gift-cards/programmes` |
| History | 025 (authored): immutable `gift_card_offer_occurrences` + mutation-rejecting trigger, `history.ts`, `offerOccurrenceSnapshot.ts`, `/gift-cards/history` |
| Planner | `lib/decision/buildDecisionResult.ts` → `DecisionResult` with `retailerGiftCardPlans`, `acceptedCards`, freshness, ranking explanations; stack engine + five-status compatibility (`compatibility.ts`, `stackability.ts`) |
| Merchant aliases | `stores.aliases text[]` (001) + `lib/sources/normalise.ts` (longest-alias-wins resolution) |
| Health | `/api/health/monitor`, `/api/health/data` (gift-card staleness counted in `dataHealth.ts`); no gift-card ingest/reconciliation health yet |
| Tests | 33 gift-card test files, decision suite, 898+ tests, Playwright e2e, CI |

### Migration state — **the central blocker**
- **Applied to prod:** 001–022 (prod-verified 2026-07-12 per handoff).
- **Authored but NOT applied (headers say so explicitly):** **023, 024, 025,
  026, 027.** Generated types **do** already include 023–027 shapes (code was
  written against them), so prod and `database.types.ts` have drifted apart —
  any feature relying on 023+ columns will fail against prod today.
- Migration ledger is unreliable; truth = `npm run verify:schema`
  (`information_schema` probing, Node 22).

### What migrations 023/025/027 already provide (per the brief's question)
- **023** — offer revisions substrate (changed candidates, sub-offer keys,
  `campaign_kind`, `source_fingerprint`), reward destination, fixed mechanics,
  `is_ongoing`, `targeted`, **`source_present` / `source_removed_at`**
  (withdrawal tracking), extended approve RPC. ✅ Covers most reconciliation
  substrate.
- **024** — programme/catalogue rates (RACV/NRMA-style). ✅ Covers ongoing
  catalogues.
- **025** — sealed public offer history. ✅ Covers historical records.
- **026** — public correction reports. ✅ Covers public trust feedback.
- **027** — Point Hacks HTML source registration, gates closed. ✅ Covers
  weekly source config.

### Genuinely missing (the programme's real work)
1. **Daily reconciliation job** — no route/engine compares canonical offers
   against latest source state; no automatic expiry archival step; no
   activation step for approved future-dated offers.
2. **Predictions** — no model, parser, or reconciliation at all.
3. **Acceptance data pipeline** — tables exist but: no channel flags
   (online/in-store/app/phone), no official/unofficial evidence-tier
   vocabulary matching the requirements, no `valid_from`/`valid_until`, no
   freshness state, no staging/candidate/review path, no alias-resolution
   ingestion, no acceptance reconciliation, and **0 product / 0 acceptance
   rows in prod**.
4. **Weekly-ingest trigger** — the Point Hacks route exists but no GitHub
   workflow fires it (`gift-card-ingest.yml` only hits the GCDB route).
5. **Gift-card operational health** — ingest/reconciliation runs are not
   surfaced in any machine-readable health endpoint.
6. **Search/planner acceptance gating** — `buildDecisionResult` consumes
   acceptance rows but does not yet enforce the required
   status/freshness/evidence-tier ranking rules (they don't exist as data).

---

## 3. Source policy

Evidence hierarchy (fixed, from the brief):
1. Gift-card issuer / official gift-card site
2. Retailer catalogue or promotion page
3. Specialist source (GCDB, Point Hacks)
4. Additional approved corroborating source
5. DealStack review and verification result

Current permission state (all **prod-verified closed**):

| Source | Type | Registry row | `terms_checked_at` / `robots_checked_at` | Automated fetch |
|---|---|---|---|---|
| GCDB offers RSS | rss | `gcdb` (021) | recorded procedure exists; gates closed | **disabled** |
| Point Hacks weekly | html | `pointhacks_weekly_gift_cards` (027, unapplied) | **null / null — review not done** | **disabled** |
| GCDB predictions page | html | **no row** | not reviewed | n/a |
| GCDB merchant database | html | **no row** | not reviewed | n/a |
| Retailer catalogues (Coles/Woolworths/Big W) | html | no rows | not reviewed | n/a |

Policy for this programme (TASK-01 formalises it):
- Preference order per source: API → RSS/feed → JSON-LD/structured data →
  permitted HTML parsing → **admin-assisted manual capture**.
- Every adapter ships **disabled** with both DB gates closed and its env flag
  off. Where automated fetching is not explicitly permitted after a recorded
  robots/terms review, the adapter stays disabled and the admin-assisted
  capture workflow (paste/upload a snapshot into the existing raw-item →
  candidate path) is the operating mode.
- No anti-bot bypass ever (`fetchEditorialPage.ts` already refuses challenge
  pages — reuse it).
- A discovery source (GCDB/Point Hacks) is never recorded as primary retailer
  evidence; `evidence_source_type` distinguishes tiers (§6).

---

## 4. Data flow (target architecture)

```
                       WEEKLY (~07:00 Sydney, dual-UTC GH cron)
 approved sources ──▶ fetch (gated) ──▶ raw snapshot ──▶ parse ──▶ normalise
                                                             │
                                              dedupe (fingerprint + advisory)
                                                             │
                              classifyChange ──▶ candidates (new/changed) ──▶ ADMIN REVIEW
                                                                                  │ approve RPC
                                                                                  ▼
        ┌──────────────── activation step (approved AND start_date ≤ today) ──▶ gift_card_offers (public via RLS)
        │                                                                         │ expiry
 07:00 job also:                                                                  ▼
   archive step (end date passed) ──▶ seal gift_card_offer_occurrences (history) + hide from active surfaces

                       DAILY reconciliation (separate GH cron)
 latest raw/source state  ⇄  canonical offers  ──▶ outcome per offer:
   unchanged │ non-material refresh (auto) │ material diff → CHANGED candidate (review)
   confirmed expiry → archive (auto) │ source-missing → source_present=false (flag only)
   explicit withdrawal → documented policy action │ parse/source failure → health signal
 predictions  ⇄  confirmed offers ──▶ matched / partial / missed (never public)
 acceptance   ⇄  latest approved acceptance evidence ──▶ acceptance change candidates
```

Trust boundaries unchanged: staging tables are service-role only; the only
path to public tables is the admin-reviewed, security-definer approve RPC;
raw prose is never stored beyond the bounded excerpt; URL allowlisting at all
four layers.

---

## 5. Scheduling design

### Weekly publication (~07:00 Australia/Sydney)
Reuses the proven pattern (no new invention required):
- **Two GitHub cron lines** — `0 20 * * *` (AEDT) and `0 21 * * *` (AEST).
- **Local-time gate** — `decideSchedule()` accepts only the 7 o'clock Sydney
  hour via `Intl` + IANA zone (DST-safe; already tested in `schedule.test.ts`).
- **Once-per-local-day idempotency** — DB-backed interval guard on the run
  registry (the weekly ingest keeps ≥40h "every other day"; the new
  activation/reconciliation jobs use a ≥20h once-per-day guard — TASK-05).
- **Distributed lock** — unique partial index on `status='running'` (exists).
- **Retry-safe run IDs, max-run-age protection, secret validation, structured
  JSON results** — all exist in `runGuarded.ts` + routes; extended, not
  rebuilt.

The 07:00 sequence (one route, ordered steps, each independently skippable):
1. Weekly source ingest (Point Hacks; GCDB rides its existing route) — stages
   candidates only.
2. **Activation**: approved offers with `start_date ≤ Sydney-today` and not
   yet active become active. (Admin-approved data only.)
3. **Archive**: offers with confirmed end date `< Sydney-today` leave active
   surfaces; occurrence row sealed into history.
4. Cache revalidation (`revalidatePath`) for `/gift-cards`, homepage marquee,
   affected stores.
5. Structured run record + health outcome.

### Daily reconciliation
- New bearer-gated route `/api/cron/gift-card-reconcile`, fired by a new GitHub
  workflow (daily; hour non-critical, run after the 07:00 window).
- **`vercel.json` is not touched** (Hobby: both daily slots already used).
- Detects the full outcome taxonomy in §4; material changes become `changed`
  candidates via the existing review queue — public truth is never silently
  overwritten. Non-material metadata (last-seen, source etag) refreshes
  automatically. Confirmed expiry archives automatically. **Source
  disappearance alone never expires an offer** — it sets
  `source_present=false` (023) and raises a review flag.

---

## 6. Merchant acceptance model

**Offer ≠ acceptance.** An offer answers "what promotion exists for buying
this card"; acceptance answers "where can this card be spent". They are
separate tables, separate reconciliation, separate freshness.

Reuse `gift_card_products` + `gift_card_merchant_acceptance` (021), extended
by **migration 028** (authored in TASK-02, applied only with explicit user
approval):

- Products: `aliases text[]`, `official_product_page`, `activation_method`,
  `online_available` / `in_store_available`, `denominations numeric[]`,
  `activation_delay_note`, `split_payment`, `expiry_or_fees_note` (all
  nullable — unknown stays unknown).
- Acceptance: channel flags (`accepts_online` / `accepts_in_store` /
  `accepts_app` / `accepts_phone`, each nullable tri-state), required status
  vocabulary (`confirmed-accepted`, `confirmed-not-accepted`,
  `likely-accepted`, `unofficially-reported`, `requires-verification`,
  `stale`, `unknown`), `evidence_source_type` (issuer-official /
  merchant-official / terms / card-network-mcc / gcdb / specialist /
  community), `evidence_url`, `evidence_captured_at`, `last_checked_at`,
  `valid_from` / `valid_until`, `limitations`, `region`,
  `participating_location_required`, `review_state`.
- MCC-based acceptance stored as rows with `mcc` set and `store_id` null;
  **official vs unofficially-reported MCC support are distinct rows with
  distinct evidence tiers**, and the UI wording distinguishes them
  ("Official supported category" vs "Unofficially reported category") with the
  standing disclaimer that MCC compatibility never guarantees acceptance at
  every business in the category.
- New staging table `gift_card_acceptance_candidates` (service-role only) +
  acceptance history preservation — removed merchants create reviewable
  changes; nothing is silently deleted.
- Alias resolution reuses `stores.aliases` + `lib/sources/normalise.ts`;
  unresolved or ambiguous names are flagged for admin, never auto-merged.

Public wording states evidence level exactly as the brief requires
("Officially listed by TCN", "Listed by GCDB; issuer confirmation not found",
"Unofficial MCC-based acceptance", "Acceptance requires verification").

## 7. Predictions (GCDB gift-card offer predictions)

Strictly isolated **migration 029** table `gift_card_offer_predictions`:
identity (predicted seller/families/type/value), dates, source URL +
last-updated, `status` in (`predicted`, `confirmed`, `historical`,
`prediction_matched`, `prediction_missed`, `prediction_partially_matched`),
`linked_offer_id` (set on match, prediction row never overwritten),
comparison notes, reviewed timestamp. No confidence score unless GCDB states
one. `✅`/`❌` markers parsed into outcomes only after their meaning is
confirmed from the page and documented in the parser.

- **Never** inserted into `gift_card_offers`; RLS default-deny (service-role
  only) — admin-only surface initially.
- Daily reconciliation matches predictions against confirmed offers
  (exact / partial / different value / family / seller / dates / no promotion
  / did-not-occur / pending) and records outcomes for accuracy analysis.
- Uses: admin planning, future-dated review preparation, source-check
  scheduling, accuracy history.
- **Recommendation: defer the public `/gift-cards/predictions` page.** It fits
  the trust model only with a prominent disclaimer, adds review load, and
  nothing else depends on it. The model supports adding it later without
  schema change. (Decision left to the user; TASK-13 lists it as an optional,
  separately-approved extension.)

## 8. Search, planner, ranking

Extends `lib/decision/buildDecisionResult.ts` (not a new pipeline):
1. Resolve query → canonical merchant (`stores` + aliases via `normalise.ts`).
2. Direct-issue gift cards for the merchant + multi-retailer cards whose
   **approved, current, non-stale** acceptance covers the merchant.
3. Active approved offers for those products (date-valid, published).
4. Channel, freshness, limits checked; saving computed by `value.ts` (single
   valuation engine — cash now vs points/bonus later stay separate).
5. Candidate layer passed to the existing compatibility engine; acceptance
   and stack-compatibility remain distinct concepts.
6. Deterministic ranking (TASK-11): active+approved → acceptance confidence
   tier (official > specialist > unofficial) → freshness → direct
   applicability → plan compatibility → immediate saving → later value →
   friction → limits. A stale unofficial acceptance record can never outrank
   a current official one (unit-tested rule).
7. Included and excluded options both explained (`rankingExplanation`,
   excluded-reason strings).

Both directions supported: "where can I use TCN Shop?" (`/gift-cards/
where-to-use`, exists) and "which cards work at Nike?" (planner/search + a
cards-for-store view). Purchase location vs redemption location never
conflated (seller/source separation already enforced; acceptance adds the
redemption side).

## 9. Admin review

Extends existing queues:
- **Offer revisions** — changed candidates already carry field-level diffs via
  `classifyChange`; TASK-14 adds revision-vs-published diff display, mark
  withdrawn, mark source-unavailable, archive/restore.
- **Acceptance queue** — new review surface for acceptance candidates: raw
  merchant name, resolved store, product, evidence tier, channels, MCC,
  previous approved relationship, diff, warnings; actions approve / reject /
  correct match / create alias / mark unofficial / mark no-longer-accepted /
  merge / split / request recheck. All audited via the existing audit path.
- **Predictions** — admin list with outcome recording.

## 10. Monitoring

Machine-readable additions (TASK-15): gift-card section in `/api/health/data`
or a dedicated `/api/health/gift-cards` (bearer-gated) reporting: last
weekly-ingest and reconciliation runs per source (distinguishing
**disabled-by-intent / fetch-not-permitted / temporary failure / parse
failure**), candidate + material-change backlog, offers due to activate /
expire, expired-but-visible count (must be 0), published offers without valid
evidence, stale acceptance count, lock failures, DST-gate skips, duplicate
reconciliation detection. GitHub `monitor-health.yml` extended to poll it.

## 11. Security

No RLS loosening. All new tables default-deny with service-role-only access
except explicitly public read-only projections (occurrences pattern). New
cron route: same timing-safe bearer auth. No secrets in code or logs. URL
policy extended for any newly approved host, allowlist-first.

## 12. Testing

Every task ships Vitest coverage; TASK-16 adds the cross-cutting scenarios:
Nike (both TCN products returned, channels distinct, deterministic rank,
plan entry, cash/points separation, truthful exclusions), expiry (leaves
active surfaces, stays in history, linked plans warn, nothing deleted),
material change (revision created, public untouched), source failure
(isolation, no data loss, health records partial failure), DST (runs once in
AEST, once in AEDT, no duplicate during UTC overlap — extends
`schedule.test.ts`), prediction isolation (never active/planner/search),
acceptance (alias resolution, ambiguous names, official-replaces-unofficial,
removal history, stale-gating, purchase-vs-redemption distinctness, no
duplicate relationships), plus accessibility/overflow e2e at 1440×900 and
390×844.

## 13. Migration plan

| # | Content | Status | Gate |
|---|---|---|---|
| 023–027 | Accuracy model, programmes, history, corrections, Point Hacks source | Authored, reviewed, **unapplied** | Explicit user approval; apply in order; `npm run types:gen` + `verify:schema` after each |
| 028 | Product catalogue + acceptance extensions, acceptance candidates/history | To author (TASK-02) | Design review (this plan) → user approval |
| 029 | Predictions table + prediction source row (disabled) | To author (TASK-02) | Same |
| 030 | Run-registry generalisation (`run_kind` on `gift_card_ingest_runs`) if design review confirms need | To author (TASK-02) | Same |

Rules: additive only; `if not exists`; RLS default-deny stated per table;
indexes for merchant search (`store_id`, `mcc`, trigram/lower on
`merchant_name` if needed); uniqueness `(product_id, store_id, mcc, region)`
partial-unique for acceptance dedupe; every migration added to
`scripts/schema-manifest.ts` (the manifest test enforces this); rollback =
documented reverse DDL per migration (additive ⇒ `drop ... if exists` safe).
**No migration is applied during this programme without explicit user
instruction.**

## 14. Rollout (staged; nothing enabled immediately)

1. Schema + code deployed with **all** new automated sources disabled.
2. Migrations 023–027, then 028–030 applied through the controlled process
   (user approval per migration; types regen; `verify:schema`).
3. Schema + RLS verified (`get_advisors`, drift probe).
4. Admin-assisted candidate exercised end-to-end (offer + acceptance).
5. Point Hacks / GCDB adapters tested in dry-run (`force=1`, gates opened
   momentarily, re-closed — the documented 2026-07-12 procedure).
6. First reconciliation run compared manually against prod rows.
7. Approved future-dated offer activation tested with one real offer.
8. Public search integration enabled (code path behind data presence — no
   flag needed once acceptance rows are approved).
9. Daily reconciliation workflow enabled.
10. Weekly 07:00 workflow enabled.
11. Monitoring observed across ≥2 AEST runs (and the next DST transition
    noted in the runbook).
12. Production automation signed off by the user. **Not before.**

Rollback: every gate is independently closable (env flag, DB row gates,
workflow disable); migrations documented with reverse DDL; occurrences and
audit history are never deleted.

## 15. Acceptance criteria (programme level)

- All §12 scenarios green; full `npm run validate:all -- --with-e2e` green on
  Node 20; `git diff --check` clean.
- No prediction row reachable from any active/public/planner/search query
  (enforced by test + RLS).
- No acceptance fact publicly visible without evidence URL + tier + checked
  date; expired offers absent from every active surface but present in
  history; approved-but-future offers absent until start date.
- Zero hard-coded merchant/product lists in components or planner rules.
- All automation gates closed at merge time; enabling documented as ops
  runbook steps requiring user approval.

## 16. Risks and blockers

| Risk | Severity | Mitigation |
|---|---|---|
| **023–027 unapplied while types already include them** — code assuming 023+ columns fails on prod | **Blocker for schema-dependent waves** | Wave 1+ code merges only after user approves applying 023–027; defensive `?? null` mapping pattern retained |
| GCDB predictions/merchant-DB fetch permission unknown | High | TASK-01 records robots/terms review; adapters disabled by default; admin-assisted capture is the fallback operating mode |
| Acceptance data volume + review load | Medium | Batched candidates, bulk admin actions (existing `bulk` prop), staged per-product rollout starting with TCN family |
| §J data-quality backlog (10/13 published rows needs-verification) | Medium | Correction pass (existing Phase 1 plan) recommended before public acceptance surfaces; not a hard programme blocker |
| Vercel Hobby cron ceiling | Low | All new triggers via GitHub Actions; `vercel.json` untouched |
| DST edge (2026-10-04 AEDT start) | Low | Existing hour-gate design already handles it; TASK-16 pins tests to both offsets |
| Point Hacks HTML shape drift | Medium | Parser-version stamping exists; reconciliation reports parse failure distinctly; fixtures updated only from genuinely captured snapshots |

## 17. Execution waves and dependency graph

See `tasks/gift-card-automation/TASK-00-INDEX.md` for the full table. Summary:

- **Wave 0 (immediately delegable, no schema dependency):** TASK-01 (source
  policy), TASK-02 (migration design/authoring — SQL files only), TASK-16a
  (test scaffolding for DST/idempotency against existing modules).
- **Wave 1 (after migration design review; code may merge before apply only
  where it degrades honestly):** TASK-03 lifecycle/activation, TASK-04
  reconciliation engine (pure), TASK-06 prediction parser (pure, fixtures),
  TASK-07 product catalogue, TASK-08 acceptance model.
- **Wave 2:** TASK-05 orchestration routes/workflows, TASK-09 acceptance
  ingestion + alias resolution, TASK-10 acceptance reconciliation.
- **Wave 3:** TASK-11 search/planner, TASK-12 compatibility reasons.
- **Wave 4:** TASK-13 public surfaces, TASK-14 admin review.
- **Wave 5:** TASK-15 monitoring, TASK-16 E2E/DST suite, TASK-17 rollout docs.

Manager review gate after every task: full diff read, scope check,
invented-data check, focused suite run, reject/correct before marking done.
