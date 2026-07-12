# DealStack AU — Engineering Backlog

> Generated 2026-07-13. Ticket evidence verified against code state `1d7b87a`; local HEAD is `54a60a2` (docs-only handoff commit, not yet pushed). 108 tickets across 15 epics, grouped into 20 iterations and 4 milestones.
>
> ⚠️ **Worktree note (2026-07-13):** uncommitted work-in-progress NOT covered by this backlog sits in the tree — approval-side safeguards (compound-campaign confirmation, membership-signal detection, spend-threshold requirement) in `lib/giftcards/approvalValidation.ts`, `app/admin/(protected)/gift-cards/review/actions.ts`, `components/admin/GiftCardReviewCard.tsx` + two new test files. It overlaps **DS-012** and **DS-017** — review, finish or discard it before executing either.
> Machine-readable twin: [DEALSTACK-BACKLOG.json](DEALSTACK-BACKLOG.json) (same tickets, same fields). Execution rules: [OPUS-EXECUTION-GUIDE.md](OPUS-EXECUTION-GUIDE.md). Ordering: [RELEASE-ROADMAP.md](RELEASE-ROADMAP.md). Dependencies: [DEPENDENCY-GRAPH.md](DEPENDENCY-GRAPH.md).
>
> Readiness legend — **Codex-ready:** clear implementation, low ambiguity. **Opus-design:** architecture or product judgement required. **Human-gated:** migration, production data, secrets or deployment approval required.

## Summary

| Priority | Count | | Effort | Count |
|---|---|---|---|---|
| P0 | 0 | | XS | 8 |
| P1 | 20 | | S | 45 |
| P2 | 61 | | M | 43 |
| P3 | 27 | | L | 11 |
| | | | XL | 1 |

Production-approval tickets: **33**. Readiness: 61 Codex-ready / 25 Opus-design / 22 Human-gated.

No ticket is P0: the P0 conditions in the priority model (public data exposure, auth bypass, destructive cron writes, raw content leaking) are all currently mitigated by shipped controls — the P1 set below is what keeps them mitigated and fixes what is actually wrong today.

## Epic A — Gift-card data accuracy (11 tickets)

*Every published gift-card row is verified, correctly typed, honestly dated and audited.*

### DS-001 — Re-verify and set expiry dates on the 7 published GCDB rows with null expiry

**Type:** data-quality · **Priority:** P1 (impact 5 / urgency 5 / confidence 5) · **Effort:** M · **Risk:** medium · **Status:** ready
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-01 · **Production approval:** **yes**

**Problem:** 7 of 13 published gift-card offers have expiry_date=null because the GCDB extractor found no end date; weekly supermarket/points promos always end, so these rows will silently go stale while remaining public.
**Why it matters:** Expired-but-listed offers are the single fastest way to lose user trust; the UI's honest 'No end date listed' fallback contains the harm but does not fix the data.
**Current behaviour:** Rows gc-apple-big-w, gc-apple-coles, gc-luxury-escapes-…-coles, gc-restaurant-choice-…-coles, gc-tcn-baby-…-wool, gc-uber-…-giftz-co, gc-amazon-airbnb-…-qanta all show expiry_date=null and confidence='needs-verification' (prod-verified 2026-07-12).
**Desired behaviour:** Each row re-verified at its cited gcdb.com.au offer page; expiry set, or the offer explicitly marked ongoing (DS-008), or unpublished when the promo has lapsed.
**Evidence:** Read-only prod SELECT 2026-07-12 (docs/OPUS-4.8-HANDOFF.md §J) · docs/gift-card-offer-corrections-2026-07-12.md rows 2-9 · lib/giftcards/offerCardViewModel.ts null-expiry fallback
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/[id]/edit/page.tsx`, `docs/gift-card-offer-corrections-2026-07-12.md`
**Out of scope:** Schema changes (ongoing flag is DS-008); the two mis-typed legacy rows (DS-003).
**Blocked by:** — · **Blocks:** DS-089 · **Parallel with:** DS-002, DS-003

**Acceptance criteria:**
- Zero published gift-card rows with expiry_date null unless explicitly reviewed as ongoing
- Every touched row has last_checked_at refreshed and an audit_log row from the admin edit UI
- Corrections doc updated with per-row outcome
**Tests:** npm run test:giftcards (no code change expected; guard against regressions)
**Validation:** `npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content`
**Manual verification:** Open each gcdb.com.au offer URL on the day of editing; screenshot or note the stated end date before saving.
**Rollback/safety:** audit_log preserves prior values; individual admin edits are reversible. · **Docs:** Update docs/gift-card-offer-corrections-2026-07-12.md status column.
**Branch:** `ds-001-re-verify-and-set-expiry-dates-on-the-7-publishe` · **Commit:** `DS-001: Re-verify and set expiry dates on the 7 published GCDB rows with null expiry`

### DS-002 — Fill verified terms on the TCN Card.Gift flagship row (promo code, cap, uses, expiry time, terms URL)

**Type:** data-quality · **Priority:** P1 (impact 4 / urgency 4 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-01 · **Production approval:** **yes**

**Problem:** gc-tcn-love-tcn-shop-tcn-cinema-tcn-good-food-card-gift is the flagship correction: owner-supplied terms (code FEELING10, $3,000 cap, 1 use, 11:59 PM AEST, AU-only, no combining) are known but unverified and unrecorded; all 022 columns for them are null in prod.
**Why it matters:** This is the highest-value discount live (10% off 4 TCN cards) and the promo code is required to redeem it — a listing without the code is not actionable.
**Current behaviour:** promo_code, expiry_time, expiry_timezone, uses_per_customer, cap_dollars, terms_url all null (prod-verified 2026-07-12); expiry_date 2026-07-17.
**Desired behaviour:** Each term verified at gcdb.com.au/offer/12870 and the Card.Gift terms page, then entered via the audited admin edit UI. Unverifiable terms stay null.
**Evidence:** docs/gift-card-offer-corrections-2026-07-12.md flagship row · Prod SELECT: all 022 detail columns null on this row · supabase/migrations/022_gift_card_offer_detail.sql
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/[id]/edit/page.tsx`
**Out of scope:** Product records for the 4 TCN cards (DS-023).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-001

**Acceptance criteria:**
- Verified terms populated; unverified terms left null (never guessed)
- Detail page /gift-cards/gc-tcn-love-tcn-shop-tcn-cinema-tcn-good-food-card-gift renders the promo code and terms rows
- audit_log rows exist for the edit
**Tests:** npm run test:giftcards
**Validation:** `npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content`
**Manual verification:** Verify each of the 8 claimed terms individually at the two cited sources; note offer ends 2026-07-17 — do this before then or close as lapsed.
**Rollback/safety:** audit_log; per-field reversal via edit UI. · **Docs:** Corrections doc row status.
**Branch:** `ds-002-fill-verified-terms-on-the-tcn-card-gift-flagshi` · **Commit:** `DS-002: Fill verified terms on the TCN Card.Gift flagship row (promo code, cap, uses, expiry time, terms URL)`

### DS-003 — Re-type the two mis-typed legacy rows (gc-apple-points, gc-coles-group-bonus-points) and strip 'Sample:' prose

**Type:** data-quality · **Priority:** P1 (impact 4 / urgency 4 / confidence 5) · **Effort:** S · **Risk:** medium · **Status:** ready
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-01 · **Production approval:** **yes**

**Problem:** Both rows are promotion_type='discount' with discount_percent=0 while the real mechanic is bonus points, and both still carry 'Sample:' wording in points_on_purchase/limit_per_customer with bare-root citations.
**Why it matters:** A 0% 'discount' misrepresents the mechanic on every surface and sample prose on a published row violates the placeholder-copy guard's intent.
**Current behaviour:** Prod-verified 2026-07-12: promotion_type='discount', discount_percent=0, points fields null, citations point at gcdb.com.au root, 'Sample:' strings present.
**Desired behaviour:** Each row either re-typed as a points promotion with a real verified multiplier/programme and clean prose + real citation URL, or unpublished (for gc-apple-points, prefer resolving via DS-004).
**Evidence:** docs/gift-card-offer-corrections-2026-07-12.md 'Older manual/sample rows' · Prod SELECT 2026-07-12 · docs/OPUS-4.8-HANDOFF.md §J rows 10-11
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/[id]/edit/page.tsx`
**Out of scope:** Automated detection of this shape (DS-100 audit script).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-001, DS-004

**Acceptance criteria:**
- No published row has promotion_type='discount' with 0% and no other value mechanic
- No published row contains 'Sample' or '(sample)' strings
- Citations point at a specific source page, not a domain root
**Tests:** npm run test:giftcards
**Validation:** `npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content`
**Manual verification:** Verify the real multiplier at the seller/programme source before re-typing.
**Rollback/safety:** audit_log. · **Docs:** Corrections doc row status.
**Branch:** `ds-003-re-type-the-two-mis-typed-legacy-rows-gc-apple-p` · **Commit:** `DS-003: Re-type the two mis-typed legacy rows (gc-apple-points, gc-coles-group-bonus-points) and strip 'Sample:' prose`

### DS-004 — Resolve the Apple-at-Woolworths duplicate: fresh queue candidate vs published gc-apple-points

**Type:** data-quality · **Priority:** P1 (impact 4 / urgency 4 / confidence 5) · **Effort:** XS · **Risk:** medium · **Status:** ready
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-01 · **Production approval:** **yes**

**Problem:** A Woolworths Apple 20x Everyday Rewards candidate (extraction confidence 0.85) sits in the review queue and duplicates published gc-apple-points; gc-apple-big-w also covers the same brand at a different seller.
**Why it matters:** Publishing both would show the same promotion twice with different values — a visible correctness failure.
**Current behaviour:** Candidate review_status='new'; gc-apple-points is published and mis-typed (DS-003).
**Desired behaviour:** EITHER approve the fresh candidate and unpublish gc-apple-points in the same session, OR reject the candidate as duplicate with a recorded rejection_reason. Never both published.
**Evidence:** docs/gift-card-offer-corrections-2026-07-12.md duplicate-risk note · Prod: 15 candidates review_status='new' · lib/giftcards/duplicateDetection.ts verdict semantics
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/review/page.tsx`
**Out of scope:** Candidate-vs-candidate dedupe tooling (DS-051).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-003

**Acceptance criteria:**
- Exactly one published Apple-at-Woolworths offer (or zero) after the session
- Rejection reason or approval+unpublish audit trail recorded
**Validation:** `npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content`
**Manual verification:** Confirm the promo's current state at the Woolworths/GCDB source before choosing.
**Rollback/safety:** audit_log; unpublish is reversible. · **Docs:** Corrections doc duplicate note resolved.
**Branch:** `ds-004-resolve-the-apple-at-woolworths-duplicate-fresh` · **Commit:** `DS-004: Resolve the Apple-at-Woolworths duplicate: fresh queue candidate vs published gc-apple-points`

### DS-005 — Time-critical: re-verify or let lapse the two offers expiring 2026-07-13 and 2026-07-15

**Type:** data-quality · **Priority:** P1 (impact 3 / urgency 5 / confidence 5) · **Effort:** XS · **Risk:** low · **Status:** ready
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-01 · **Production approval:** **yes**

**Problem:** gc-amazon-ultimate-… (33-brand compound row) expires 2026-07-13 and gc-ultimate-jbhifi (RACV) expires 2026-07-15; neither has been re-verified.
**Why it matters:** If the promos were extended, we silently drop live value; if they lapsed early, we list dead offers until the date passes. Also contains the compound-campaign row without schema work.
**Current behaviour:** Both published with near-term expiry, confidence needs-verification/confirmed-stale (prod-verified 2026-07-12).
**Desired behaviour:** Each checked at its source before its expiry date; extended/corrected via admin edit, or deliberately left to lapse (RLS hides at expiry).
**Evidence:** Prod SELECT 2026-07-12: expiry_date values · docs/OPUS-4.8-HANDOFF.md §J
**Likely files/subsystems:** `docs/gift-card-offer-corrections-2026-07-12.md`
**Out of scope:** Splitting the compound Amazon row (DS-021).
**Blocked by:** — · **Blocks:** DS-021 · **Parallel with:** DS-001

**Acceptance criteria:**
- Decision recorded per row before its expiry date
- No action needed if allowed to lapse — note that explicitly in the corrections doc
**Manual verification:** Check gcdb.com.au/offer/12680 and the RACV member-benefits page.
**Rollback/safety:** n/a (verification-only unless edited). · **Docs:** Corrections doc row status.
**Branch:** `ds-005-time-critical-re-verify-or-let-lapse-the-two-off` · **Commit:** `DS-005: Time-critical: re-verify or let lapse the two offers expiring 2026-07-13 and 2026-07-15`

### DS-006 — Re-verify or downgrade stale gc-restaurant-cafe-choice (last checked 2026-05-20)

**Type:** data-quality · **Priority:** P2 (impact 3 / urgency 3 / confidence 5) · **Effort:** XS · **Risk:** low · **Status:** ready
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-01 · **Production approval:** **yes**

**Problem:** The NRMA Blue row is confidence='confirmed' but last_checked_at is 2026-05-20 — more than double the 21-day staleness threshold — and limit_per_customer still says '(sample)'.
**Why it matters:** 'Confirmed' + stale is worse than 'needs-verification': it actively overstates evidence quality.
**Current behaviour:** Prod-verified 2026-07-12; STALE_DATA_DAYS=21 in lib/stack/compatibility.ts.
**Desired behaviour:** Re-verified at the NRMA Blue benefits page (refresh last_checked_at, clean prose) or confidence downgraded to needs-verification.
**Evidence:** Prod SELECT 2026-07-12 · lib/stack/compatibility.ts:26 STALE_DATA_DAYS · docs/gift-card-offer-corrections-2026-07-12.md row
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/[id]/edit/page.tsx`
**Out of scope:** Programme/catalogue modelling of NRMA (DS-035..DS-037).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-001

**Acceptance criteria:**
- last_checked_at within 21 days OR confidence downgraded
- No '(sample)' wording remains on the row
**Validation:** `npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content`
**Manual verification:** Check the NRMA Blue members gift-card page.
**Rollback/safety:** audit_log. · **Docs:** Corrections doc row status.
**Branch:** `ds-006-re-verify-or-downgrade-stale-gc-restaurant-cafe` · **Commit:** `DS-006: Re-verify or downgrade stale gc-restaurant-cafe-choice (last checked 2026-05-20)`

### DS-007 — Review the 15 gift-card candidates still in the queue (review_status='new')

**Type:** data-quality · **Priority:** P1 (impact 4 / urgency 3 / confidence 5) · **Effort:** M · **Risk:** medium · **Status:** ready
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-02 · **Production approval:** **yes**

**Problem:** 15 of the 24 candidates staged by the 2026-07-12 ingest run were never reviewed; some may carry fresher data than published rows (the Apple candidate proves this) and some will expire unreviewed.
**Why it matters:** An unreviewed backlog silently ages; the queue is the pipeline's whole point.
**Current behaviour:** Prod-verified 2026-07-12: review_status counts = 9 approved, 15 new.
**Desired behaviour:** Every candidate approved (meeting approvalValidation requirements), rejected with a reason, or explicitly deferred; queue count reduced to reviewed states.
**Evidence:** Prod SELECT: review_status breakdown · lib/giftcards/approvalValidation.ts approval requirements
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/review/page.tsx`
**Out of scope:** Queue tooling improvements (DS-050..DS-056).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-001, DS-002

**Acceptance criteria:**
- 0 candidates left in review_status='new' (or an explicit written defer list)
- Every approval passed validation (seller, value, source URL, expiry-or-ongoing)
- Duplicate verdicts heeded (no double-publish)
**Validation:** `npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content`
**Manual verification:** Use /admin/gift-cards/review; verify each approval at its source URL.
**Rollback/safety:** Approvals reversible via unpublish; rejections recorded. · **Docs:** Note outcome counts in corrections doc or PROJECT_STATE.
**Branch:** `ds-007-review-the-15-gift-card-candidates-still-in-the` · **Commit:** `DS-007: Review the 15 gift-card candidates still in the queue (review_status='new')`

### DS-008 — Persist an explicit 'ongoing' reviewed state on gift_card_offers (migration)

**Type:** migration · **Priority:** P1 (impact 4 / urgency 3 / confidence 4) · **Effort:** M · **Risk:** medium · **Status:** ready
**Agent:** Opus 4.8 · **Readiness:** Human-gated · **Iteration:** IT-04 · **Production approval:** **yes**

**Problem:** approvalValidation.ts accepts an 'ongoing' tick as the alternative to an expiry date, but gift_card_offers has no column to store it — a reviewed-ongoing offer and a never-verified missing date both persist as expiry_date=null, losing the review outcome.
**Why it matters:** The UI must distinguish 'reviewed: no end date' from 'source omitted an end date'; today it honestly but unhelpfully says 'No end date listed' for both.
**Current behaviour:** No is_ongoing column (prod information_schema 2026-07-12); approvalValidation.ts:52 has ongoing:boolean input that is validated then dropped.
**Desired behaviour:** Additive migration 023 adds is_ongoing boolean not null default false; approve RPC and admin edit persist it; view-model/termsRows render 'Ongoing offer' when true; schema manifest + regenerated types updated in the same commit.
**Evidence:** lib/giftcards/approvalValidation.ts:52,200-206 · Prod column list for gift_card_offers (no ongoing column) · scripts/schema-manifest.ts pattern for 022
**Likely files/subsystems:** `supabase/migrations/023_gift_card_ongoing.sql (new file)`, `lib/giftcards/approvalValidation.ts`, `lib/giftcards/offerCardViewModel.ts`, `lib/giftcards/termsRows.ts`, `lib/admin/repos/giftCardPipeline.ts`, `scripts/schema-manifest.ts`, `lib/supabase/database.types.ts`
**Out of scope:** DB-level constraint tying expiry/ongoing (DS-089).
**Blocked by:** — · **Blocks:** DS-009, DS-089 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Migration is additive/idempotent with rollback notes in-file (022 style)
- approve_gift_card_candidate carries the flag; admin edit exposes it
- offerCardViewModel + termsRows distinguish ongoing vs not-recorded (unit-tested)
- schema-manifest + database.types.ts updated in the same commit
**Tests:** tests/giftcards/offerCardViewModel.test.ts; tests/giftcards/termsRows.test.ts; tests/admin/schemaManifest.test.ts
**Validation:** `npm run lint` && `npx tsc --noEmit` && `npx vitest run` && `npm run build`
**Manual verification:** Post-apply: probe information_schema for the column; verify offers hash unchanged (handoff §M recipe).
**Rollback/safety:** drop column + re-run 022 RPC definition (same pattern as 022 header). · **Docs:** docs/gift-card-pipeline.md approval section; schema manifest.
**Branch:** `ds-008-persist-an-explicit-ongoing-reviewed-state-on-gi` · **Commit:** `DS-008: Persist an explicit 'ongoing' reviewed state on gift_card_offers (migration)`

### DS-009 — Data-health checks for gift-card rows: missing expiry, stale last_checked, sample prose

**Type:** observability · **Priority:** P2 (impact 3 / urgency 3 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-04 · **Production approval:** no

**Problem:** The dashboard/data-health surface flags card-offer problems but has no gift-card equivalents; every §J gap (null expiry, stale checked, sample prose, 0%-discount mis-type) was found by hand.
**Why it matters:** These exact defect shapes already occurred in production; mechanical detection prevents recurrence.
**Current behaviour:** lib/admin/repos/dataHealth.ts and the placeholder-copy guard cover other offer types; gift-card rows are unchecked.
**Desired behaviour:** Data-quality flags for published gift-card rows: expiry_date null and not is_ongoing; last_checked_at older than 21 days; 'Sample'/'(sample)' strings; discount type with 0% and no other mechanic value; citation URL equal to a bare domain root.
**Evidence:** Every flagged shape existed in prod on 2026-07-12 (handoff §J) · lib/admin/repos/dataHealth.ts existing pattern · lib/stack/compatibility.ts STALE_DATA_DAYS
**Likely files/subsystems:** `lib/admin/repos/dataHealth.ts`, `app/admin/(protected)/dashboard/page.tsx`
**Out of scope:** Auto-correction; health endpoint exposure (DS-072).
**Blocked by:** DS-008 · **Blocks:** — · **Parallel with:** DS-071

**Acceptance criteria:**
- Each of the 5 defect shapes produces a dashboard flag with offer id and reason
- Flags clear when the condition clears; covered by unit tests with prod-shaped fixtures
**Tests:** tests/admin/ new dataHealth gift-card cases; npm run test:admin
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Load /admin/dashboard against a DB snapshot containing the known-bad rows.
**Rollback/safety:** Revert commit; read-only feature. · **Docs:** None.
**Branch:** `ds-009-data-health-checks-for-gift-card-rows-missing-ex` · **Commit:** `DS-009: Data-health checks for gift-card rows: missing expiry, stale last_checked, sample prose`

### DS-010 — Capture card format (physical/digital/both) at review time and backfill the 15 'unknown' rows

**Type:** data-quality · **Priority:** P2 (impact 2 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** mixed · **Readiness:** Human-gated · **Iteration:** IT-02 · **Production approval:** **yes**

**Problem:** All 15 gift_card_offers rows have format='unknown' even where the source states it (e.g. Card.Gift physical+digital), and the review UI does not prompt for it.
**Why it matters:** Format drives shipping fees, delivery speed and wallet support — buyers ask it first.
**Current behaviour:** format column exists (021) with 'unknown' everywhere (prod-verified 2026-07-12).
**Desired behaviour:** Review/edit forms prompt for format with 'unknown' allowed; the extractor maps explicit source wording when present; published rows backfilled where the source states format.
**Evidence:** Prod SELECT: format='unknown' on all rows · lib/giftcards/extractOffer.ts (no format extraction today)
**Likely files/subsystems:** `lib/giftcards/extractOffer.ts`, `app/admin/(protected)/gift-cards/review/page.tsx`, `app/admin/(protected)/gift-cards/[id]/edit/page.tsx`
**Out of scope:** Product-level format (gift_card_products.format already exists).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-001

**Acceptance criteria:**
- Format selectable in review + edit forms and persisted through the approve RPC
- Extractor emits format only on explicit wording (unit-tested; never guesses)
- Backfill applied via audited edits for rows whose source states format
**Tests:** tests/giftcards/extractOffer.test.ts new cases; npm run test:giftcards
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Backfill step requires checking each source page (fold into DS-001 visits).
**Rollback/safety:** audit_log for data; revert for code. · **Docs:** None.
**Branch:** `ds-010-capture-card-format-physical-digital-both-at-rev` · **Commit:** `DS-010: Capture card format (physical/digital/both) at review time and backfill the 15 'unknown' rows`

### DS-011 — Fix stale documentation: gift-card-pipeline.md 021 claim, PROJECT_STATE.md refresh

**Type:** documentation · **Priority:** P2 (impact 3 / urgency 3 / confidence 5) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-02 · **Production approval:** no

**Problem:** docs/gift-card-pipeline.md still says migration 021 is 'not yet applied to production' (applied 2026-07-12, commit b541521); docs/launch-management/PROJECT_STATE.md predates the gift-card pipeline entirely and claims 'only Amex published' for card offers (prod has 4/5 published).
**Why it matters:** The next agent is explicitly told docs may be stale; reducing known lies cheapens every future verification pass.
**Current behaviour:** Two verified-stale documents (handoff §A 'highest-risk area #3').
**Desired behaviour:** gift-card-pipeline.md migration line corrected; PROJECT_STATE.md §2/§4/§11 refreshed to 1d7b87a state (gift-card pipeline shipped, 021/022 applied, card offers 4/5, test counts 898).
**Evidence:** docs/gift-card-pipeline.md line ~13 · Prod card_offers count 4 published/5 total (2026-07-12) · docs/OPUS-4.8-HANDOFF.md stale-docs findings
**Likely files/subsystems:** `docs/gift-card-pipeline.md`, `docs/launch-management/PROJECT_STATE.md`
**Out of scope:** Automation of doc freshness (DS-102).
**Blocked by:** — · **Blocks:** DS-102 · **Parallel with:** DS-090

**Acceptance criteria:**
- No doc claims 021/022 unapplied
- PROJECT_STATE.md counts match prod-verified values with an as-of date
- Handoff docs cross-referenced, not duplicated
**Validation:** `git diff --check`
**Manual verification:** Re-read both docs end-to-end for other stale claims while editing.
**Rollback/safety:** git revert. · **Docs:** This IS the docs update.
**Branch:** `ds-011-fix-stale-documentation-gift-card-pipeline-md-02` · **Commit:** `DS-011: Fix stale documentation: gift-card-pipeline.md 021 claim, PROJECT_STATE.md refresh`

## Epic B — Compound gift-card campaigns (10 tickets)

*Multi-offer source pages are represented as true sub-offers, not flattened.*

### DS-012 — ADR: compound-campaign representation (relational sub-offers vs JSON-first)

**Type:** research · **Priority:** P1 (impact 5 / urgency 3 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** needs-design
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-12 · **Production approval:** no

**Problem:** One GCDB source page can describe several sub-offers (the live 33-brand Amazon row proves it); the schema forces one candidate/offer per raw item, so mixed mechanics, caps and expiry states get flattened or dropped.
**Why it matters:** Every Epic B ticket hangs off this decision; choosing wrong forces a second migration later.
**Current behaviour:** gift_card_offer_candidates and gift_card_offers are strictly 1:1 with a raw item; included_product_ids (022) is the only multi-item hook.
**Desired behaviour:** A written ADR in docs/DEALSTACK-DECISIONS.md choosing between (a) child sub-offer tables keyed by stable sub-offer keys, or (b) JSON sub-offer arrays inside the candidate first, migrating later — with dedupe, change-detection, approval-RPC and UI implications addressed, and the user's sign-off recorded.
**Evidence:** docs/OPUS-4.8-HANDOFF.md §F lesson 1 and §O question 3 · Prod row gc-amazon-ultimate-… (33 brands, one value) · supabase/migrations/021_gift_card_pipeline.sql candidate shape
**Likely files/subsystems:** `docs/DEALSTACK-DECISIONS.md`
**Out of scope:** Any implementation.
**Blocked by:** — · **Blocks:** DS-013, DS-015 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- ADR entry with context/decision/consequences/files
- Stable sub-offer key scheme specified (survives feed re-ordering and re-parses)
- User has explicitly approved the direction
**Manual verification:** Walk the live Amazon campaign and the TCN 4-card page through the proposed model on paper.
**Rollback/safety:** n/a (decision document). · **Docs:** docs/DEALSTACK-DECISIONS.md new ADR.
**Branch:** `ds-012-adr-compound-campaign-representation-relational` · **Commit:** `DS-012: ADR: compound-campaign representation (relational sub-offers vs JSON-first)`

### DS-013 — Migration: compound sub-offer schema per the ADR

**Type:** migration · **Priority:** P1 (impact 5 / urgency 2 / confidence 3) · **Effort:** L · **Risk:** high · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Human-gated · **Iteration:** IT-12 · **Production approval:** **yes**

**Problem:** No storage exists for multiple sub-offers under one raw item / one campaign.
**Why it matters:** Prerequisite for accurate multi-offer extraction, review and publication.
**Current behaviour:** 1:1 candidate/offer model (021/022).
**Desired behaviour:** Additive migration implementing the DS-012 decision: sub-offer storage with stable keys, mechanics fields, per-sub-offer dates/caps, linkage to campaign/raw item; approve RPC extended; RLS default-deny preserved; manifest + types in the same commit.
**Evidence:** DS-012 ADR (pending) · 022 migration as the additive/rollback-documented template
**Likely files/subsystems:** `supabase/migrations/023 or 024 (new file)`, `scripts/schema-manifest.ts`, `lib/supabase/database.types.ts`
**Out of scope:** Extractor/UI changes (DS-014, DS-019).
**Blocked by:** DS-012 · **Blocks:** DS-014 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Idempotent, additive, in-file rollback notes
- RLS: no new public read paths beyond published offers
- schema-manifest + regenerated types in the same commit
- approve RPC handles sub-offer approval atomically
**Tests:** tests/admin/schemaManifest.test.ts; npx tsc --noEmit
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Apply to prod only after explicit approval; information_schema probe + offers-hash check afterwards.
**Rollback/safety:** In-file drop-and-restore notes (022 pattern). · **Docs:** docs/gift-card-pipeline.md schema section.
**Branch:** `ds-013-migration-compound-sub-offer-schema-per-the-adr` · **Commit:** `DS-013: Migration: compound sub-offer schema per the ADR`

### DS-014 — Extractor emits multiple candidates/sub-offers per raw item with stable keys

**Type:** feature · **Priority:** P1 (impact 5 / urgency 2 / confidence 3) · **Effort:** L · **Risk:** medium · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-13 · **Production approval:** no

**Problem:** extractOffer.ts maps one parsed item to one candidate; multi-offer pages lose all but the flattened summary.
**Why it matters:** The Amazon campaign shape recurs in the live feed; correctness of the newest data depends on this.
**Current behaviour:** lib/giftcards/extractOffer.ts single-candidate contract; runIngest.ts dedupes on (source_id, external_id).
**Desired behaviour:** Extraction returns 1..N sub-offers per item, each with a stable key (content-derived, order-independent), confidence and warnings; runIngest stages each; unchanged sub-offers bump last_seen only.
**Evidence:** lib/giftcards/extractOffer.ts · lib/giftcards/runIngest.ts idempotency contract · live compound row in prod
**Likely files/subsystems:** `lib/giftcards/extractOffer.ts`, `lib/giftcards/runIngest.ts`, `lib/admin/repos/giftCardPipeline.ts`
**Out of scope:** Admin split UI (DS-019).
**Blocked by:** DS-013, DS-091 · **Blocks:** DS-018, DS-019, DS-048 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Fixture with a real compound item yields N distinct sub-offers with stable keys across re-parses and re-ordered feeds
- Single-offer items behave exactly as today (regression suite green)
- Idempotency proven: second ingest of identical content stages nothing new
**Tests:** tests/giftcards/extractOffer.test.ts; tests/giftcards/runIngest.test.ts; new compound fixture (DS-091)
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Dry-run against the captured real feed fixture.
**Rollback/safety:** Revert; staging-only surface. · **Docs:** docs/gift-card-pipeline.md modules table.
**Branch:** `ds-014-extractor-emits-multiple-candidates-sub-offers-p` · **Commit:** `DS-014: Extractor emits multiple candidates/sub-offers per raw item with stable keys`

### DS-015 — Support fixed-dollar discount mechanic ($X off / $X off per $Y)

**Type:** feature · **Priority:** P2 (impact 4 / urgency 2 / confidence 3) · **Effort:** M · **Risk:** medium · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-14 · **Production approval:** **yes**

**Problem:** Only percent-discount, bonus-percent and points-multiplier mechanics exist; fixed-dollar promos ('$10 off $100') cannot be represented and are currently rejected or mis-shaped at extraction.
**Why it matters:** GCDB regularly carries fixed-dollar promos; every one is lost today.
**Current behaviour:** promotion_type check constraint + value fields from 021; lib/giftcards/value.ts has no fixed-dollar formula.
**Desired behaviour:** Mechanic added end-to-end: schema value fields, extraction, single valuation formula in value.ts, card badge, detail worked example, approval validation.
**Evidence:** supabase/migrations/021_gift_card_pipeline.sql promotion_type constraint · lib/giftcards/value.ts · docs/OPUS-4.8-HANDOFF.md §F lesson 2
**Likely files/subsystems:** `lib/giftcards/value.ts`, `lib/giftcards/extractOffer.ts`, `lib/giftcards/offerCardViewModel.ts`, `lib/giftcards/approvalValidation.ts`
**Out of scope:** Promo credit / fee waivers (DS-016).
**Blocked by:** DS-012 · **Blocks:** DS-016, DS-063 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Fixed-dollar offer round-trips ingest→review→approve→public with correct effective-% derivation at a given spend
- value.ts is the only place the formula lives; unit-tested including min_spend interaction
- View-model renders an honest badge (e.g. '$10 OFF $100')
**Tests:** tests/giftcards/value.test.ts; tests/giftcards/offerCardViewModel.test.ts; tests/giftcards/extractOffer.test.ts
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Visual check of card + detail with a prod-shaped fixture.
**Rollback/safety:** Additive column rollback per migration notes. · **Docs:** docs/gift-card-pipeline.md valuation section.
**Branch:** `ds-015-support-fixed-dollar-discount-mechanic-x-off-x-o` · **Commit:** `DS-015: Support fixed-dollar discount mechanic ($X off / $X off per $Y)`

### DS-016 — Support promo-credit and fee-waiver mechanics

**Type:** feature · **Priority:** P2 (impact 3 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** medium · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-14 · **Production approval:** **yes**

**Problem:** 'Spend $100, get $10 credit later' and 'purchase-fee waived' promos have no representation; both differ materially from discounts (reward destination + timing).
**Why it matters:** Handoff §F lessons 2-3: mechanic and reward destination must not be conflated; these are the two remaining common mechanics.
**Current behaviour:** Not representable; extractor warnings the only trace.
**Desired behaviour:** Both mechanics modelled with explicit reward-destination and timing fields; valuation shows credit separately from cash saving (never summed); fee waiver renders as cost-avoidance.
**Evidence:** docs/OPUS-4.8-HANDOFF.md §F lessons 2-3 · lib/giftcards/value.ts separation precedent for points
**Likely files/subsystems:** `lib/giftcards/value.ts`, `lib/giftcards/offerCardViewModel.ts`, `lib/giftcards/extractOffer.ts`
**Out of scope:** Stack integration (DS-063).
**Blocked by:** DS-015 · **Blocks:** DS-063 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Credit and waiver offers render with cash-now vs value-later clearly separated
- Stack engine ignores them until DS-063 (explicitly out of stack totals)
- Unit tests for each formula and display
**Tests:** tests/giftcards/value.test.ts; tests/giftcards/offerCardViewModel.test.ts
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Fixture-driven visual check.
**Rollback/safety:** Additive rollback notes. · **Docs:** docs/gift-card-pipeline.md valuation disclosure.
**Branch:** `ds-016-support-promo-credit-and-fee-waiver-mechanics` · **Commit:** `DS-016: Support promo-credit and fee-waiver mechanics`

### DS-017 — Extract and render membership/targeting gates (member-only, app-only, activation)

**Type:** feature · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-14 · **Production approval:** no

**Problem:** membership_required and activation_required columns exist (021) but the extractor never populates them and targeting wording ('Prime members', 'app only') is dropped, so gated offers look universally available.
**Why it matters:** A member-gated offer presented as general is a false-availability claim.
**Current behaviour:** Columns exist and are rendered when set; extraction never sets them (lib/giftcards/extractOffer.ts has no membership mapping).
**Desired behaviour:** Extractor maps explicit gating phrases to the existing fields with warnings for ambiguous wording; review UI prompts when warnings fire; card/detail already render the fields (verify + test).
**Evidence:** Prod columns membership_required/activation_required (021) · lib/giftcards/extractOffer.ts · tests/giftcards/extractOffer.test.ts
**Likely files/subsystems:** `lib/giftcards/extractOffer.ts`, `lib/giftcards/offerCardViewModel.ts`
**Out of scope:** New gate types needing schema (DS-012 scope).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-041, DS-045

**Acceptance criteria:**
- Fixture items with 'members only'/'activate first' wording populate the fields (unit-tested)
- Ambiguous wording produces a warning, never a silent guess
- Card + detail render the gate; stack warning path verified (ties to DS-059)
**Tests:** tests/giftcards/extractOffer.test.ts; tests/giftcards/offerCardViewModel.test.ts
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** None beyond fixtures.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-017-extract-and-render-membership-targeting-gates-me` · **Commit:** `DS-017: Extract and render membership/targeting gates (member-only, app-only, activation)`

### DS-018 — classifyChange: detect sub-offer added/removed/changed within a campaign

**Type:** feature · **Priority:** P2 (impact 4 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** medium · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-13 · **Production approval:** no

**Problem:** classifyChange.ts diffs two whole-item extractions; once items carry N sub-offers, a removed or added sub-offer must re-stage only the affected sub-offer, not the whole campaign.
**Why it matters:** Without sub-offer-level change detection, every campaign tweak forces re-review of everything or, worse, silently misses a removal.
**Current behaviour:** lib/giftcards/classifyChange.ts single-offer diff vocabulary (cosmetic/material/expiry-extension/…/source-removed).
**Desired behaviour:** Diff operates per stable sub-offer key: added → new candidate; removed → source-removed candidate for that sub-offer; changed → existing classification per sub-offer.
**Evidence:** lib/giftcards/classifyChange.ts · DS-014 stable keys
**Likely files/subsystems:** `lib/giftcards/classifyChange.ts`, `lib/giftcards/runIngest.ts`
**Out of scope:** UI presentation of diffs (DS-050).
**Blocked by:** DS-014 · **Blocks:** DS-021 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Fixture pair (campaign v1/v2) produces exactly the per-sub-offer classifications expected
- Unchanged sub-offers produce no candidates (idempotency preserved)
**Tests:** tests/giftcards/classifyChange.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** docs/gift-card-pipeline.md modules table.
**Branch:** `ds-018-classifychange-detect-sub-offer-added-removed-ch` · **Commit:** `DS-018: classifyChange: detect sub-offer added/removed/changed within a campaign`

### DS-019 — Admin candidate-splitting UI for compound campaigns

**Type:** feature · **Priority:** P2 (impact 4 / urgency 1 / confidence 3) · **Effort:** L · **Risk:** medium · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-13 · **Production approval:** no

**Problem:** Even with multi-candidate extraction, admins need to split/merge/edit sub-offers the parser got wrong before approving each independently.
**Why it matters:** Extraction will never be perfect; the human gate needs the tools to fix shape, not just values.
**Current behaviour:** /admin/gift-cards/review edits a single candidate's fields only.
**Desired behaviour:** Review page groups sub-offers by campaign/raw item; admin can split one candidate into more, merge, edit each, and approve/reject each independently, all audited.
**Evidence:** app/admin/(protected)/gift-cards/review/page.tsx · DS-012 ADR scope
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/review/page.tsx`, `app/admin/(protected)/gift-cards/review/actions.ts`, `lib/admin/repos/giftCardPipeline.ts`
**Out of scope:** Bulk queue actions (DS-054).
**Blocked by:** DS-014 · **Blocks:** DS-021 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Split/merge operations persist and are audited
- Approving one sub-offer leaves siblings staged
- Validation (DS-008 ongoing rule etc.) applies per sub-offer
**Tests:** tests/admin/ review action tests; npm run test:admin
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Walk the Amazon-campaign fixture through split→approve-one→reject-one.
**Rollback/safety:** Revert; staging-side only. · **Docs:** docs/gift-card-pipeline.md review section.
**Branch:** `ds-019-admin-candidate-splitting-ui-for-compound-campai` · **Commit:** `DS-019: Admin candidate-splitting UI for compound campaigns`

### DS-020 — Idempotent raw-item reprocessing gated by parser_version

**Type:** reliability · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Opus 4.8 · **Readiness:** Codex-ready · **Iteration:** IT-12 · **Production approval:** **yes**

**Problem:** gift_card_raw_items stores parser_version and the full structured payload, but there is no path to re-extract stored items after a parser improvement — new extraction logic only benefits future fetches.
**Why it matters:** Parser fixes (compound support, membership gates, format) should apply to the 24 already-stored items without refetching the network.
**Current behaviour:** Columns parser_version/processing_status exist (prod-verified); no reprocess entry point in runIngest.ts or the admin repo.
**Desired behaviour:** A service-role reprocess routine: for raw items with parser_version < current, re-run extraction from raw_payload, stage changed candidates via the normal classifyChange path, bump parser_version; no network, no duplicate candidates for unchanged output.
**Evidence:** Prod columns on gift_card_raw_items · lib/giftcards/runIngest.ts idempotency design
**Likely files/subsystems:** `lib/giftcards/runIngest.ts`, `lib/admin/repos/giftCardPipeline.ts`, `app/admin/(protected)/gift-cards/actions.ts`
**Out of scope:** Automatic reprocess on deploy.
**Blocked by:** — · **Blocks:** DS-053 · **Parallel with:** DS-017

**Acceptance criteria:**
- Reprocessing all items twice stages zero new candidates the second time
- Version bump recorded per item; run ledger entry distinguishes reprocess from fetch
- Zero outbound requests during reprocess (enforced in test via DI fetch that throws)
**Tests:** tests/giftcards/runIngest.test.ts new reprocess cases
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** One controlled prod reprocess after DS-014 lands (requires approval).
**Rollback/safety:** Candidates are staged-only; reject them. · **Docs:** docs/gift-card-pipeline.md operating section.
**Branch:** `ds-020-idempotent-raw-item-reprocessing-gated-by-parser` · **Commit:** `DS-020: Idempotent raw-item reprocessing gated by parser_version`

### DS-021 — Split the published 33-brand Amazon compound row into true sub-offers

**Type:** data-quality · **Priority:** P2 (impact 4 / urgency 2 / confidence 3) · **Effort:** S · **Risk:** medium · **Status:** blocked
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-14 · **Production approval:** **yes**

**Problem:** gc-amazon-ultimate-… flattens an entire campaign (33 brands, mixed products) into one 10%-discount row — the canonical compound-campaign misrepresentation, live in production.
**Why it matters:** It is the worst single accuracy defect visible to users (assuming it survives DS-005 re-verification).
**Current behaviour:** One published row, brand string 500+ chars (prod-verified 2026-07-12).
**Desired behaviour:** Campaign re-ingested/reprocessed through the compound pipeline, sub-offers reviewed and approved individually, original row unpublished in the same audited session.
**Evidence:** Prod row (id gc-amazon-ultimate-active-wellness-…) · DS-012..DS-019 chain
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/review/page.tsx`
**Out of scope:** n/a — this is the end-to-end validation of Epic B.
**Blocked by:** DS-019, DS-018, DS-005 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- No published row represents more than one distinct mechanic/value/date set
- Original row unpublished with audit trail; replacement sub-offers published only after per-row review
**Validation:** `npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content`
**Manual verification:** Full review of each sub-offer at the source.
**Rollback/safety:** Republish original row from audit history if the split proves wrong. · **Docs:** Corrections doc addendum.
**Branch:** `ds-021-split-the-published-33-brand-amazon-compound-row` · **Commit:** `DS-021: Split the published 33-brand Amazon compound row into true sub-offers`

## Epic C — Gift-card products and acceptance (8 tickets)

*Product records, merchant acceptance and MCC knowledge power the detail pages.*

### DS-022 — Admin CRUD for gift_card_products and merchant-acceptance rows

**Type:** feature · **Priority:** P1 (impact 5 / urgency 3 / confidence 5) · **Effort:** L · **Risk:** low · **Status:** ready
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-15 · **Production approval:** no

**Problem:** gift_card_products and gift_card_merchant_acceptance are fully modelled (021/022: issuer, network, denomination range, MCC arrays, wallet, evidence, checked_at) but hold 0 rows and there is NO admin UI to create or edit them — the entire acceptance/MCC layer of the detail pages renders fallbacks everywhere.
**Why it matters:** Every Epic C/D ticket and the detail page's core value ('which cards work where') is blocked on being able to enter product data at all.
**Current behaviour:** Admin gift-cards pages cover offers only (app/admin/(protected)/gift-cards/ has no products route); tables empty (prod-verified 2026-07-12).
**Desired behaviour:** Protected admin pages for product CRUD and per-product acceptance rows (merchant, category, MCC, status/outcome, source_url evidence, checked_at, is_public), following the stores/card-offers CRUD patterns, audited and rate-limited like other admin writes.
**Evidence:** Prod: 0 rows in both tables; full column list verified · app/admin/(protected)/gift-cards/ file listing (no products route) · lib/repos/giftCardProducts.ts read path exists
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/products/ (new files)`, `lib/admin/repos/giftCards.ts`, `lib/repos/giftCardProducts.ts`
**Out of scope:** Entering the actual product data (DS-023..DS-026).
**Blocked by:** — · **Blocks:** DS-023, DS-024, DS-028, DS-030, DS-055 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Create/edit/deactivate product; add/edit acceptance rows with evidence URL required
- is_public gate respected — nothing public without it
- Audit rows for every write; urlPolicy validation on evidence URLs
- Unit tests for the repo layer
**Tests:** tests/admin/ new product repo tests; npm run test:admin
**Validation:** `npm run lint` && `npx tsc --noEmit` && `npx vitest run` && `npm run build`
**Manual verification:** Create one draft product end-to-end locally.
**Rollback/safety:** Revert; tables stay empty until used. · **Docs:** docs/gift-card-pipeline.md products section (new).
**Branch:** `ds-022-admin-crud-for-gift-card-products-and-merchant-a` · **Commit:** `DS-022: Admin CRUD for gift_card_products and merchant-acceptance rows`

### DS-023 — Create evidence-backed product records for the TCN card family

**Type:** data-quality · **Priority:** P2 (impact 4 / urgency 3 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** blocked
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-15 · **Production approval:** **yes**

**Problem:** Six published offers cover TCN cards (Love/Shop/Cinema/Good Food/Baby/Gift/Teen/Deluxe) with zero product records, so PROD/MCC gaps flagged in the corrections doc cannot be closed.
**Why it matters:** TCN is the most-covered family in current live offers.
**Current behaviour:** 0 product rows (prod-verified).
**Desired behaviour:** One gift_card_products row per TCN product with issuer, network, format, denomination range and cited source_evidence; linked from offers via product_id/included_product_ids (DS-025).
**Evidence:** docs/gift-card-offer-corrections-2026-07-12.md PROD gaps · Prod: gift_card_products empty
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/products/ (new files)`
**Out of scope:** Acceptance/MCC rows (DS-026).
**Blocked by:** DS-022 · **Blocks:** DS-025, DS-026 · **Parallel with:** DS-024

**Acceptance criteria:**
- Every TCN product named in a published offer has a product row with at least issuer, network, format and one evidence citation
- No invented MCC data — unknown stays empty
**Validation:** `npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content`
**Manual verification:** Evidence from TCN's official product pages only.
**Rollback/safety:** Deactivate rows (is_active). · **Docs:** None.
**Branch:** `ds-023-create-evidence-backed-product-records-for-the-t` · **Commit:** `DS-023: Create evidence-backed product records for the TCN card family`

### DS-024 — Create evidence-backed product records for the Ultimate card family

**Type:** data-quality · **Priority:** P2 (impact 4 / urgency 3 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** blocked
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-15 · **Production approval:** **yes**

**Problem:** The Ultimate family (18+ variants named in the flattened Amazon row and the Giftz row) has zero product records.
**Why it matters:** Second-most-covered family; prerequisite for splitting the compound row meaningfully (DS-021).
**Current behaviour:** 0 product rows.
**Desired behaviour:** Product rows for each Ultimate variant appearing in published offers, with issuer (EML/Ultimate), network, format and evidence.
**Evidence:** Prod brand strings on gc-amazon-ultimate-… and gc-uber-…-giftz-co · docs/gift-card-offer-corrections-2026-07-12.md
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/products/ (new files)`
**Out of scope:** MCC data (DS-026).
**Blocked by:** DS-022 · **Blocks:** DS-025, DS-026 · **Parallel with:** DS-023

**Acceptance criteria:**
- Every Ultimate variant in a published offer has a product row with citation
- Variants no longer sold are marked is_active=false rather than deleted
**Manual verification:** Ultimate/EML official pages as evidence.
**Rollback/safety:** is_active=false. · **Docs:** None.
**Branch:** `ds-024-create-evidence-backed-product-records-for-the-u` · **Commit:** `DS-024: Create evidence-backed product records for the Ultimate card family`

### DS-025 — Link published offers to product records (product_id / included_product_ids backfill)

**Type:** data-quality · **Priority:** P2 (impact 4 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** blocked
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-15 · **Production approval:** **yes**

**Problem:** gift_card_offers.product_id and included_product_ids (022) are null/empty on all rows, so detail pages cannot show per-product terms even once products exist.
**Why it matters:** The linkage is what turns product records into user-visible acceptance/denomination knowledge.
**Current behaviour:** All published rows unlinked (prod-verified).
**Desired behaviour:** Every published offer linked to its product(s) via audited admin edits; multi-card promos use included_product_ids; review UI supports linking for future approvals (DS-055).
**Evidence:** Prod: included_product_ids='{}' everywhere · lib/repos/giftCardProducts.ts join path
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/[id]/edit/page.tsx`
**Out of scope:** Acceptance evidence itself (DS-026).
**Blocked by:** DS-023, DS-024 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- 13 published rows linked or explicitly noted as unlinkable
- Detail pages render the product acceptance section for linked offers
**Tests:** npm run test:giftcards
**Validation:** `npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content`
**Manual verification:** Spot-check three detail pages after linking.
**Rollback/safety:** audit_log. · **Docs:** None.
**Branch:** `ds-025-link-published-offers-to-product-records-product` · **Commit:** `DS-025: Link published offers to product records (product_id / included_product_ids backfill)`

### DS-026 — Enter merchant-acceptance and MCC evidence for TCN and Ultimate products

**Type:** data-quality · **Priority:** P2 (impact 4 / urgency 2 / confidence 3) · **Effort:** L · **Risk:** medium · **Status:** blocked
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-15 · **Production approval:** **yes**

**Problem:** gift_card_merchant_acceptance is empty; supported_mccs/unsupported_mccs are empty arrays — the detail page's acceptance model (with its mandatory MCC disclaimer) has nothing to show.
**Why it matters:** Acceptance-by-MCC is the differentiating knowledge of the product (handoff §F lesson 5).
**Current behaviour:** 0 acceptance rows; MCC arrays empty (prod-verified).
**Desired behaviour:** Cited acceptance rows (merchant, category, MCC, status, outcome, source_url, checked_at) for the TCN and Ultimate families from official acceptance lists only; is_public set only for evidence-backed rows.
**Evidence:** Prod schema: full acceptance column list verified 2026-07-12 · lib/giftcards/acceptanceModel.ts confidence tiers ready to render
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/products/ (new files)`
**Out of scope:** Community-contributed acceptance (DS-104 scope boundary).
**Blocked by:** DS-023, DS-024 · **Blocks:** DS-027, DS-029, DS-033 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Acceptance sections render on linked detail pages with confidence tiers and the MCC disclaimer
- Every row has source_url + checked_at; zero uncited rows public
**Tests:** tests/giftcards/acceptanceModel.test.ts
**Validation:** `npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content`
**Manual verification:** Official issuer 'where to use' pages only; no community hearsay (handoff §F lesson 10).
**Rollback/safety:** is_public=false per row. · **Docs:** None.
**Branch:** `ds-026-enter-merchant-acceptance-and-mcc-evidence-for-t` · **Commit:** `DS-026: Enter merchant-acceptance and MCC evidence for TCN and Ultimate products`

### DS-027 — Surface acceptance-evidence staleness (checked_at) in admin and on detail pages

**Type:** data-quality · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** blocked
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-16 · **Production approval:** no

**Problem:** gift_card_merchant_acceptance.checked_at exists but nothing renders or monitors it — acceptance facts will silently age exactly like offer facts did (gc-restaurant-cafe-choice precedent).
**Why it matters:** Acceptance rules change when issuers renegotiate; stale acceptance shown confidently is a repeat of a known failure shape.
**Current behaviour:** Column exists, unused in acceptanceModel confidence tiers or admin lists.
**Desired behaviour:** acceptanceModel downgrades confidence tier when checked_at exceeds the shared 21-day threshold; admin product view lists stale rows; data-health flag added.
**Evidence:** Prod column checked_at verified · lib/giftcards/acceptanceModel.ts · lib/stack/compatibility.ts STALE_DATA_DAYS
**Likely files/subsystems:** `lib/giftcards/acceptanceModel.ts`, `lib/admin/repos/dataHealth.ts`
**Out of scope:** Re-verification workflow automation.
**Blocked by:** DS-026 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Stale acceptance renders at a lower tier with an honest label (unit-tested)
- Admin sees a stale-acceptance list; data-health flag counts them
**Tests:** tests/giftcards/acceptanceModel.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-027-surface-acceptance-evidence-staleness-checked-at` · **Commit:** `DS-027: Surface acceptance-evidence staleness (checked_at) in admin and on detail pages`

### DS-028 — Render product logistics: mobile-wallet support and physical→digital notes

**Type:** feature · **Priority:** P3 (impact 2 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** blocked
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-16 · **Production approval:** no

**Problem:** gift_card_products.mobile_wallet and redemption_notes exist but the detail page never renders them; buyers can't see whether a card loads into Apple/Google Wallet or converts physical→digital.
**Why it matters:** Practical usability facts that the schema already paid for.
**Current behaviour:** Columns exist (prod-verified), unrendered in app/gift-cards/[id]/page.tsx composition.
**Desired behaviour:** Detail page product section shows wallet support and redemption/conversion notes when recorded, with the standard 'not recorded' fallback.
**Evidence:** Prod columns mobile_wallet, redemption_notes · lib/giftcards/acceptanceModel.ts / termsRows.ts fallback pattern
**Likely files/subsystems:** `lib/giftcards/acceptanceModel.ts`, `app/gift-cards/[id]/page.tsx`
**Out of scope:** Populating the data (DS-023/DS-024).
**Blocked by:** DS-022 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Fields render when set, honest fallback when null (unit-tested)
- No layout regression on rows without product links
**Tests:** tests/giftcards/acceptanceModel.test.ts or termsRows.test.ts
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Visual check with a fixture product.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-028-render-product-logistics-mobile-wallet-support-a` · **Commit:** `DS-028: Render product logistics: mobile-wallet support and physical→digital notes`

### DS-029 — Public 'which gift cards work at store X' acceptance search

**Type:** feature · **Priority:** P2 (impact 4 / urgency 1 / confidence 3) · **Effort:** L · **Risk:** low · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-19 · **Production approval:** no

**Problem:** Acceptance knowledge is only reachable from an offer's detail page; the natural buyer question inverts it — start from the store, find usable cards and live promos for them.
**Why it matters:** Turns the acceptance dataset into a discovery surface and differentiates the product.
**Current behaviour:** No route; /search covers offers/stores/signals only.
**Desired behaviour:** A public page (or /search extension) querying published acceptance rows by store/merchant, listing accepted products with confidence tiers and any live offers for those products, respecting is_public and RLS.
**Evidence:** gift_card_merchant_acceptance store_id/merchant_name columns · app/search/page.tsx cross-entity precedent
**Likely files/subsystems:** `app/gift-cards/page.tsx`, `lib/repos/giftCardProducts.ts`
**Out of scope:** User-contributed acceptance reports (DS-104 pattern, future).
**Blocked by:** DS-026 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Store query returns accepted products + live linked offers with confidence labels
- Empty/unknown store renders honest empty state
- Anon-role query path only (no service-role leakage)
**Tests:** tests/giftcards/ new query tests; npm run test:giftcards
**Validation:** `npm run lint` && `npx vitest run` && `npm run build` && `npm run test:e2e`
**Manual verification:** Visual pass desktop+mobile.
**Rollback/safety:** Revert route. · **Docs:** README routes list.
**Branch:** `ds-029-public-which-gift-cards-work-at-store-x-acceptan` · **Commit:** `DS-029: Public 'which gift cards work at store X' acceptance search`

## Epic D — Product-specific promotion rules (5 tickets)

*Denominations, limits and caps are structured and drive honest worked examples.*

### DS-030 — Fixed denomination lists and exclusions per product

**Type:** feature · **Priority:** P2 (impact 3 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** medium · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-16 · **Production approval:** **yes**

**Problem:** Products model only a min/max variable-load range; cards sold in fixed denominations ($50/$100/$500 only) or with excluded denominations can't be represented, so worked examples and cap maths can mislead.
**Why it matters:** Denomination truth feeds every purchase-quantity calculation (handoff §F lesson 4).
**Current behaviour:** gift_card_products has variable_load, min_denomination, max_denomination only (prod-verified).
**Desired behaviour:** Additive migration: denominations integer[] (empty = variable) + excluded_denominations; admin CRUD support; acceptanceModel/worked example consume it.
**Evidence:** Prod product columns · lib/giftcards/value.ts buildWorkedExample
**Likely files/subsystems:** `supabase/migrations/ (new file)`, `scripts/schema-manifest.ts`, `lib/giftcards/value.ts`, `lib/supabase/database.types.ts`
**Out of scope:** Quantity optimisation (DS-034).
**Blocked by:** DS-022 · **Blocks:** DS-032, DS-034 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Fixed-denomination product renders its list; variable products unchanged
- Migration additive with rollback notes; manifest + types same commit
**Tests:** tests/giftcards/workedExample.test.ts; tests/admin/schemaManifest.test.ts
**Validation:** `npm run lint` && `npx tsc --noEmit` && `npx vitest run` && `npm run build`
**Manual verification:** Post-apply information_schema probe.
**Rollback/safety:** Drop columns per notes. · **Docs:** docs/gift-card-pipeline.md products section.
**Branch:** `ds-030-fixed-denomination-lists-and-exclusions-per-prod` · **Commit:** `DS-030: Fixed denomination lists and exclusions per product`

### DS-031 — Model per-day / per-account purchase limits distinctly from per-customer prose

**Type:** feature · **Priority:** P3 (impact 2 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** low · **Status:** needs-design
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-16 · **Production approval:** **yes**

**Problem:** Limits live in two places with different rigor: uses_per_customer (integer, 022) and limit_per_customer (free prose, 001); per-day and per-account limits have no structured home, so limit maths can't be computed.
**Why it matters:** Limit truth determines how much of a promo a user can actually capture (handoff §F lesson 4).
**Current behaviour:** Mixed structured/prose limits; '(sample)' prose still present on legacy rows (DS-003/DS-006).
**Desired behaviour:** A small design note choosing structured limit fields (per_day, per_account) vs a typed limits JSON; then the additive schema + display rows; prose kept as supplementary only.
**Evidence:** 022 uses_per_customer vs 001 limit_per_customer split · docs/gift-card-offer-corrections-2026-07-12.md CAP legend
**Likely files/subsystems:** `lib/giftcards/termsRows.ts`, `supabase/migrations/ (new file)`
**Out of scope:** Enforcing limits in stack maths (DS-060).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Design note approved; fields added additively; termsRows renders each limit type distinctly
- No prose-only limit on a row that has the structured equivalent
**Tests:** tests/giftcards/termsRows.test.ts
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** None.
**Rollback/safety:** Additive rollback. · **Docs:** None.
**Branch:** `ds-031-model-per-day-per-account-purchase-limits-distin` · **Commit:** `DS-031: Model per-day / per-account purchase limits distinctly from per-customer prose`

### DS-032 — Worked examples use denominations and caps (buy N × $X to reach the cap)

**Type:** feature · **Priority:** P2 (impact 3 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** low · **Status:** blocked
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-16 · **Production approval:** no

**Problem:** buildWorkedExample assumes an arbitrary face value; with fixed denominations and purchase caps known, the example should show the real optimal purchase (e.g. 6 × $500 to reach a $3,000 cap).
**Why it matters:** The worked example is the page's most concrete promise; making it purchasable-as-shown removes a quiet fiction.
**Current behaviour:** lib/giftcards/value.ts buildWorkedExample uses face value only; cap_dollars not threaded.
**Desired behaviour:** Example computes quantity × denomination against cap and per-customer limits when known; falls back to today's behaviour when not.
**Evidence:** lib/giftcards/value.ts · tests/giftcards/workedExample.test.ts · TCN $3,000 cap case (DS-002)
**Likely files/subsystems:** `lib/giftcards/value.ts`, `components/GiftCardWorkedExample.tsx`
**Out of scope:** Multi-card stack totals (DS-034).
**Blocked by:** DS-030 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Capped fixed-denomination fixture renders the exact N × $X breakdown (unit-tested)
- Rows without denomination/cap data render unchanged
**Tests:** tests/giftcards/workedExample.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** Visual check on the TCN detail page after DS-002.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-032-worked-examples-use-denominations-and-caps-buy-n` · **Commit:** `DS-032: Worked examples use denominations and caps (buy N × $X to reach the cap)`

### DS-033 — Render per-merchant/channel redemption limits on detail pages

**Type:** feature · **Priority:** P3 (impact 2 / urgency 1 / confidence 3) · **Effort:** S · **Risk:** low · **Status:** blocked
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-16 · **Production approval:** no

**Problem:** Acceptance rows can record channel restrictions (merchant_category/notes) but the detail page's terms section doesn't distinguish 'accepted' from 'accepted in-store only / max $X per transaction'.
**Why it matters:** Channel limits are the fine print that breaks redemption at the till.
**Current behaviour:** acceptanceModel renders merchant lists; notes column unrendered per-merchant.
**Desired behaviour:** Acceptance entries show channel/limit notes inline with their confidence tier.
**Evidence:** gift_card_merchant_acceptance.notes / merchant_category columns · lib/giftcards/acceptanceModel.ts
**Likely files/subsystems:** `lib/giftcards/acceptanceModel.ts`, `components/GiftCardAcceptance.tsx`
**Out of scope:** Data entry (DS-026).
**Blocked by:** DS-026 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Notes render per merchant when present, capped in length; fallback unchanged
**Tests:** tests/giftcards/acceptanceModel.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-033-render-per-merchant-channel-redemption-limits-on` · **Commit:** `DS-033: Render per-merchant/channel redemption limits on detail pages`

### DS-034 — Multi-card purchase maths: cap-aware quantity calculations in the valuation engine

**Type:** feature · **Priority:** P3 (impact 3 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** medium · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-16 · **Production approval:** no

**Problem:** For a spend larger than one card's max denomination, savings depend on how many cards can be bought under cap/limit rules; value.ts computes single-purchase figures only.
**Why it matters:** Big-ticket stacking (the product's headline use case) usually involves multiple cards.
**Current behaviour:** lib/stack/buildStack.ts caps eligible spend by capDollars; no quantity/denomination logic anywhere.
**Desired behaviour:** value.ts gains a pure multi-card computation (quantity, total acquisition cost, capped saving) reused by worked example and stack layer; explicitly conservative when limits unknown.
**Evidence:** lib/stack/buildStack.ts:165-182 cap semantics · DS-030 denominations
**Likely files/subsystems:** `lib/giftcards/value.ts`, `lib/stack/buildStack.ts`
**Out of scope:** Denomination schema (DS-030).
**Blocked by:** DS-030 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Property test: computed saving never exceeds cap or spend
- Stack layer and worked example show identical figures for the same inputs
**Tests:** tests/giftcards/value.test.ts; tests/stack/ integration case
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** docs/gift-card-pipeline.md valuation.
**Branch:** `ds-034-multi-card-purchase-maths-cap-aware-quantity-cal` · **Commit:** `DS-034: Multi-card purchase maths: cap-aware quantity calculations in the valuation engine`

## Epic E — Membership and ongoing catalogues (6 tickets)

*Member programmes are modelled as programmes, not fake time-boxed offers.*

### DS-035 — ADR: programme/catalogue entity for ongoing member benefits (NRMA, RACV, Macquarie)

**Type:** research · **Priority:** P2 (impact 4 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** needs-design
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-18 · **Production approval:** no

**Problem:** Ongoing membership catalogues are faked as long-dated discount offers (gc-restaurant-cafe-choice, gc-ultimate-jbhifi), forcing fictional expiry dates and hiding the membership gate (handoff §F lesson 6).
**Why it matters:** Two live rows already misfit the model; growth into member catalogues multiplies the distortion.
**Current behaviour:** No programme entity; membership_required boolean is the only hook.
**Desired behaviour:** ADR deciding programme schema (programme → member rates per product, rate history, verification cadence) vs continuing offer-shaped modelling; explicit user sign-off (handoff §O question 4).
**Evidence:** docs/OPUS-4.8-HANDOFF.md §F lesson 6, §O q4 · Prod rows gc-restaurant-cafe-choice / gc-ultimate-jbhifi
**Likely files/subsystems:** `docs/DEALSTACK-DECISIONS.md`
**Out of scope:** Implementation (DS-036..DS-039).
**Blocked by:** — · **Blocks:** DS-036 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- ADR with schema sketch, public-UX implications, migration path for the two live rows
- User decision recorded
**Manual verification:** Model NRMA Blue and RACV catalogues on paper.
**Rollback/safety:** n/a. · **Docs:** docs/DEALSTACK-DECISIONS.md new ADR.
**Branch:** `ds-035-adr-programme-catalogue-entity-for-ongoing-membe` · **Commit:** `DS-035: ADR: programme/catalogue entity for ongoing member benefits (NRMA, RACV, Macquarie)`

### DS-036 — Programme schema: entities, member rates, rate history (migration)

**Type:** migration · **Priority:** P2 (impact 4 / urgency 1 / confidence 3) · **Effort:** L · **Risk:** high · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Human-gated · **Iteration:** IT-18 · **Production approval:** **yes**

**Problem:** No storage for programmes, their per-product rates, membership/payment requirements or rate change history.
**Why it matters:** Implements DS-035; unlocks catalogue UI and honest modelling of the two live member rows.
**Current behaviour:** n/a.
**Desired behaviour:** Additive migration per the ADR: programmes, programme_rates (with effective_from/until for history), RLS default-deny with published-read where appropriate; manifest + types same commit.
**Evidence:** DS-035 ADR (pending) · 022 migration template
**Likely files/subsystems:** `supabase/migrations/ (new file)`, `scripts/schema-manifest.ts`, `lib/supabase/database.types.ts`
**Out of scope:** UI (DS-038).
**Blocked by:** DS-035 · **Blocks:** DS-037, DS-038, DS-039 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Idempotent, additive, rollback notes in-file
- Rate history queryable (current rate + previous rates)
- Manifest + types updated; RLS verified default-deny
**Tests:** tests/admin/schemaManifest.test.ts
**Validation:** `npm run lint` && `npx tsc --noEmit` && `npx vitest run` && `npm run build`
**Manual verification:** Prod apply only with explicit approval + probe.
**Rollback/safety:** Drop-and-restore notes. · **Docs:** docs/gift-card-pipeline.md programmes section (new).
**Branch:** `ds-036-programme-schema-entities-member-rates-rate-hist` · **Commit:** `DS-036: Programme schema: entities, member rates, rate history (migration)`

### DS-037 — Migrate the NRMA and RACV rows into programme entries

**Type:** data-quality · **Priority:** P2 (impact 3 / urgency 1 / confidence 3) · **Effort:** S · **Risk:** medium · **Status:** blocked
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-18 · **Production approval:** **yes**

**Problem:** The two member-benefit rows carry invented promotion-shaped dates and will keep needing fake renewals.
**Why it matters:** Ends the recurring re-verification fiction for ongoing catalogues.
**Current behaviour:** Both live as discount offers with 2026-07/2026-07 dates.
**Desired behaviour:** Both re-entered as programme rates with membership requirements; offer rows unpublished in the same audited session; public surfaces show them under the programme UX.
**Evidence:** Prod rows · DS-035/DS-036 chain
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/page.tsx`
**Out of scope:** Macquarie (needs DS-040 research first).
**Blocked by:** DS-036, DS-038 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- No published offer row fakes an ongoing programme
- Programme entries verified at NRMA/RACV sources on entry day
**Validation:** `npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content`
**Manual verification:** Source verification per rate.
**Rollback/safety:** Republish offer rows from audit history. · **Docs:** Corrections doc addendum.
**Branch:** `ds-037-migrate-the-nrma-and-racv-rows-into-programme-en` · **Commit:** `DS-037: Migrate the NRMA and RACV rows into programme entries`

### DS-038 — Public programme catalogue UI (rates, membership gates, freshness)

**Type:** feature · **Priority:** P2 (impact 3 / urgency 1 / confidence 3) · **Effort:** L · **Risk:** low · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-18 · **Production approval:** no

**Problem:** Programme rates need a public surface distinct from time-boxed promotions — ongoing rate, membership requirement, last-verified date, rate history.
**Why it matters:** Without UI the programme entity is invisible; with offer-UI it lies about urgency.
**Current behaviour:** n/a.
**Desired behaviour:** Programme listing + detail surface within /gift-cards, clearly labelled 'member rate — ongoing', showing verification freshness and linking member products; sorted/filterable alongside offers without pretending to expire.
**Evidence:** DS-036 schema · lib/giftcards/publicQuery.ts tab pattern
**Likely files/subsystems:** `app/gift-cards/page.tsx`, `lib/giftcards/publicQuery.ts`
**Out of scope:** Rate-change alerting (DS-039).
**Blocked by:** DS-036 · **Blocks:** DS-037 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Programme rates render with membership gate + last-verified date
- No countdown/urgency styling on ongoing rates
- e2e covers the new surface
**Tests:** tests/giftcards/publicQuery.test.ts; tests/e2e/public-flows.spec.ts
**Validation:** `npm run lint` && `npx vitest run` && `npm run build` && `npm run test:e2e`
**Manual verification:** Visual pass desktop+mobile.
**Rollback/safety:** Revert. · **Docs:** README routes.
**Branch:** `ds-038-public-programme-catalogue-ui-rates-membership-g` · **Commit:** `DS-038: Public programme catalogue UI (rates, membership gates, freshness)`

### DS-039 — Programme rate verification cadence and stale-rate flags

**Type:** observability · **Priority:** P3 (impact 2 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** low · **Status:** blocked
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-18 · **Production approval:** no

**Problem:** Ongoing rates have no expiry to force re-review; without a verification cadence they rot invisibly — the exact failure DS-006 showed for offer rows.
**Why it matters:** Ongoing data needs time-based staleness discipline precisely because nothing else expires it.
**Current behaviour:** n/a (post-DS-036).
**Desired behaviour:** Programme rates carry checked_at; data-health flags rates past threshold; admin one-click 'mark re-checked' (existing dashboard pattern 1c8a20c).
**Evidence:** DS-006 staleness precedent · admin 'Mark re-checked' pattern in dashboard
**Likely files/subsystems:** `lib/admin/repos/dataHealth.ts`, `app/admin/(protected)/dashboard/page.tsx`
**Out of scope:** Automated rate fetching (no compliant source).
**Blocked by:** DS-036 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Stale rates flagged on dashboard and downgraded in public confidence label
- Re-check updates checked_at with audit row
**Tests:** tests/admin/ dataHealth cases
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-039-programme-rate-verification-cadence-and-stale-ra` · **Commit:** `DS-039: Programme rate verification cadence and stale-rate flags`

### DS-040 — Research: member-catalogue sources (Macquarie Marketplace et al) — compliance-first evaluation

**Type:** research · **Priority:** P3 (impact 2 / urgency 1 / confidence 3) · **Effort:** S · **Risk:** low · **Status:** future
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-20 · **Production approval:** no

**Problem:** Member catalogues beyond NRMA/RACV (e.g. Macquarie Marketplace) are product goals but have no verified compliant data path (no known RSS).
**Why it matters:** The repo's rule is RSS/Atom or nothing (migration 017 precedent: evaluate, record, reject if scrape-only).
**Current behaviour:** No evaluation on file.
**Desired behaviour:** A recorded evaluation per candidate source: feed availability, robots/ToS posture, decision (register-disabled or reject) — written like migration 017's decision log; NO fetching implementation.
**Evidence:** supabase/migrations/017_card_source_registry.sql decision-record pattern · docs/OPUS-4.8-HANDOFF.md ADR-1
**Likely files/subsystems:** `docs/source-expansion-strategy.md`
**Out of scope:** Any fetching code.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Written evaluation per source with cited robots/feed findings
- Rejected sources recorded so the question isn't re-litigated
**Manual verification:** Manual robots.txt / feed discovery checks only.
**Rollback/safety:** n/a. · **Docs:** docs/source-expansion-strategy.md addendum.
**Branch:** `ds-040-research-member-catalogue-sources-macquarie-mark` · **Commit:** `DS-040: Research: member-catalogue sources (Macquarie Marketplace et al) — compliance-first evaluation`

## Epic F — Ingestion and source adapters (9 tickets)

*The pipeline fetches respectfully, fails loudly, recovers cleanly and can grow sources.*

### DS-041 — Zero-item anomaly detection on ingest runs

**Type:** reliability · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-06 · **Production approval:** no

**Problem:** A feed that suddenly returns 0 items with HTTP 200 (layout change, empty feed bug, silent block) records status='ok' — indistinguishable from a healthy quiet day, and nobody is alerted.
**Why it matters:** Silent feed death is the classic monitor failure; the OzBargain side has staleness warnings, the gift-card side has nothing.
**Current behaviour:** runIngest.ts records items_seen; no anomaly logic; lib/monitor/staleness.ts exists for the other pipeline.
**Desired behaviour:** items_seen=0 on a non-skipped run yields status='partial' (or a warning field) and surfaces in admin ops + health; threshold configurable.
**Evidence:** gift_card_ingest_runs.items_seen column · lib/monitor/staleness.ts precedent
**Likely files/subsystems:** `lib/giftcards/runIngest.ts`, `lib/admin/repos/giftCardPipeline.ts`
**Out of scope:** Alert delivery (DS-075).
**Blocked by:** — · **Blocks:** DS-075 · **Parallel with:** DS-045

**Acceptance criteria:**
- Zero-item run visibly warns in run ledger and admin surface (unit-tested via DI)
- Legitimate skip (gates/hour) does NOT warn
**Tests:** tests/giftcards/runIngest.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** docs/gift-card-pipeline.md ops.
**Branch:** `ds-041-zero-item-anomaly-detection-on-ingest-runs` · **Commit:** `DS-041: Zero-item anomaly detection on ingest runs`

### DS-042 — Test-enforce response-size and content-type limits on the GCDB fetch path

**Type:** security · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-06 · **Production approval:** no

**Problem:** urlPolicy documents bounded response bodies and the route reports non-XML as blocked, but the gift-card fetch path lacks focused tests proving a 100MB body or text/html content-type is rejected before parsing.
**Why it matters:** The fetch boundary is the pipeline's only network surface; its failure modes deserve explicit regression tests, not inherited assumptions.
**Current behaviour:** lib/security/urlPolicy.ts bounds exist; tests/giftcards/giftCardIngestRoute.test.ts covers gates, not body limits.
**Desired behaviour:** Unit tests (DI fetch) asserting: oversized body → blocked run; wrong content-type → blocked; gcdb.com.au host allowlist enforced; redirect >3 hops rejected.
**Evidence:** lib/security/urlPolicy.ts · docs/gift-card-pipeline.md four-gates section · tests/giftcards/giftCardIngestRoute.test.ts
**Likely files/subsystems:** `tests/giftcards/giftCardIngestRoute.test.ts`, `app/api/cron/gift-card-ingest/route.ts`
**Out of scope:** Monitor-side fetch (already covered in tests/monitor).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-041

**Acceptance criteria:**
- All four boundary cases covered and passing
- Any gap found is fixed in the same ticket (bounded scope: fetch path only)
**Tests:** tests/giftcards/giftCardIngestRoute.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-042-test-enforce-response-size-and-content-type-limi` · **Commit:** `DS-042: Test-enforce response-size and content-type limits on the GCDB fetch path`

### DS-043 — Bounded retry/backoff for transient ingest fetch failures

**Type:** reliability · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-06 · **Production approval:** no

**Problem:** One transient network blip fails the whole every-other-day ingest run — the next attempt is ~40h later. The OzBargain monitor has backoff (lib/monitor/backoff.ts); the gift-card ingest does not.
**Why it matters:** A 2-day data gap from a 2-second blip is a poor trade; retry-once-with-jitter fixes most of it.
**Current behaviour:** Single fetch attempt in the ingest route; run finalised error via runGuarded.
**Desired behaviour:** Up to 2 in-run retries with short bounded backoff for network-class failures only (never for blocked/challenge responses); retries recorded in run metrics.
**Evidence:** lib/monitor/backoff.ts precedent · lib/giftcards/runGuarded.ts finalisation contract
**Likely files/subsystems:** `lib/giftcards/runIngest.ts`, `app/api/cron/gift-card-ingest/route.ts`
**Out of scope:** Cross-run failure streaks (DS-044).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Transient-then-success fixture completes ok with retry count recorded
- Blocked/challenge responses never retried (unit-tested)
- runGuarded invariants preserved
**Tests:** tests/giftcards/runIngest.test.ts; tests/giftcards/runGuarded.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-043-bounded-retry-backoff-for-transient-ingest-fetch` · **Commit:** `DS-043: Bounded retry/backoff for transient ingest fetch failures`

### DS-044 — Failure-streak auto-pause: disable a source after N consecutive error runs

**Type:** reliability · **Priority:** P2 (impact 3 / urgency 1 / confidence 4) · **Effort:** M · **Risk:** medium · **Status:** ready
**Agent:** Opus 4.8 · **Readiness:** Codex-ready · **Iteration:** IT-06 · **Production approval:** **yes**

**Problem:** If the feed breaks permanently, the scheduler will keep producing error runs every other day forever; feed_items ingestion has failure tracking (020 recheck has consecutive_validation_failures) but gift-card sources have only last_error.
**Why it matters:** Respectful automation stops hammering a broken/blocking source; ops gets one clear signal instead of a drip of errors.
**Current behaviour:** gift_card_sources.last_error/last_error_at only; no streak counter or auto-pause.
**Desired behaviour:** Streak counter on the source row; after N (default 3) consecutive non-skip errors the source auto-disables (enabled=false) with an audit row and a prominent admin banner; re-enable is manual.
**Evidence:** 020 consecutive_validation_failures precedent · gift_card_sources columns (prod-verified)
**Likely files/subsystems:** `lib/giftcards/runIngest.ts`, `lib/admin/repos/giftCardPipeline.ts`, `supabase/migrations/ (new file, streak column)`
**Out of scope:** Notification delivery (ALERT_WEBHOOK_URL wiring exists).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Third consecutive error auto-pauses (DI-tested); skip runs don't count
- Audit row + admin banner on pause; manual re-enable path documented
**Tests:** tests/giftcards/runIngest.test.ts or runGuarded.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None (activation-time behaviour).
**Rollback/safety:** Column additive; behaviour flag-free but conservative. · **Docs:** docs/gift-card-pipeline.md ops + runbook (DS-076).
**Branch:** `ds-044-failure-streak-auto-pause-disable-a-source-after` · **Commit:** `DS-044: Failure-streak auto-pause: disable a source after N consecutive error runs`

### DS-045 — Parser rejection-rate warning threshold per run

**Type:** observability · **Priority:** P3 (impact 2 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-06 · **Production approval:** no

**Problem:** items_rejected is recorded per run but never evaluated; a feed format drift that rejects 30 of 40 items still reports status='ok'.
**Why it matters:** Rejection-rate spikes are the earliest parser-drift signal.
**Current behaviour:** gift_card_ingest_runs.items_rejected recorded, unused.
**Desired behaviour:** Run finaliser marks status='partial' with an explanatory summary when rejected/seen exceeds a threshold (default 25%, min 5 items).
**Evidence:** gift_card_ingest_runs columns · lib/giftcards/runIngest.ts metrics
**Likely files/subsystems:** `lib/giftcards/runIngest.ts`
**Out of scope:** Health endpoint exposure (DS-072).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-041

**Acceptance criteria:**
- Threshold breach → partial + reason (unit-tested); below threshold unchanged
**Tests:** tests/giftcards/runIngest.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-045-parser-rejection-rate-warning-threshold-per-run` · **Commit:** `DS-045: Parser rejection-rate warning threshold per run`

### DS-046 — Retention policy for gift_card_raw_items and ingest runs

**Type:** reliability · **Priority:** P3 (impact 2 / urgency 1 / confidence 4) · **Effort:** M · **Risk:** medium · **Status:** ready
**Agent:** Opus 4.8 · **Readiness:** Codex-ready · **Iteration:** IT-17 · **Production approval:** **yes**

**Problem:** Raw items and run rows accumulate forever; migration 019 established retention for the feed pipeline but the gift-card tables have no equivalent, and raw snapshots of reviewed items have no reason to persist indefinitely.
**Why it matters:** Unbounded staging growth degrades queries and holds source content longer than needed (data-minimisation posture of ADR-9).
**Current behaviour:** No purge function for gift_card_raw_items / gift_card_ingest_runs.
**Desired behaviour:** Reviewed/stale raw items purged after a window (keeping candidate linkage intact via FK rules), old skipped runs pruned; implemented as a guarded SQL function like 019's purge_reviewed_feed_items, invoked from the existing daily pipeline.
**Evidence:** supabase/migrations/019_pipeline_lifecycle_retention.sql pattern · 24 raw items today, growing per run
**Likely files/subsystems:** `supabase/migrations/ (new file)`, `scripts/schema-manifest.ts`
**Out of scope:** Feed-pipeline retention (exists, 019).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Purge function idempotent, respects FK links from candidates, unit/DB-tested
- Manifest + types updated; migration additive with rollback notes
**Tests:** tests/admin/schemaManifest.test.ts
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Prod apply with approval; verify counts before/after first purge.
**Rollback/safety:** Function drop; purged rows unrecoverable — window chosen conservatively. · **Docs:** docs/gift-card-pipeline.md storage section.
**Branch:** `ds-046-retention-policy-for-gift-card-raw-items-and-ing` · **Commit:** `DS-046: Retention policy for gift_card_raw_items and ingest runs`

### DS-047 — Hostile and malformed feed fixtures for parseGcdbFeed (broken XML, entity bombs, HTML injection)

**Type:** testing · **Priority:** P2 (impact 3 / urgency 2 / confidence 5) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-06 · **Production approval:** no

**Problem:** The monitor parser gained malformed-XML survival after a real incident (commit 1fae4ed); parseGcdbFeed has no equivalent hostile-input suite — truncated XML, entity expansion, HTML/script tags inside titles, and oversized excerpts are untested.
**Why it matters:** The parser feeds admin-reviewed UI; injected markup in the ≤280-char excerpt must provably render inert and malformed feeds must fail the run cleanly, not crash it.
**Current behaviour:** tests/giftcards/parseGcdbFeed.test.ts covers happy paths on synthetic fixtures.
**Desired behaviour:** Fixture suite: truncated XML, wrong root element, HTML in title/description, entity-heavy payloads, 10k-char descriptions — each either parses safely (excerpt sanitised, bounded) or fails with a clean error consumed by runGuarded.
**Evidence:** Commit 1fae4ed monitor precedent · lib/giftcards/parseGcdbFeed.ts bounded-excerpt contract
**Likely files/subsystems:** `tests/giftcards/parseGcdbFeed.test.ts`, `lib/giftcards/parseGcdbFeed.ts`
**Out of scope:** Real-feed capture (DS-091).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-091

**Acceptance criteria:**
- All hostile fixtures pass: no throw escapes the parser boundary; excerpts free of markup; length bound enforced
- Any real gap found is fixed within the ticket
**Tests:** tests/giftcards/parseGcdbFeed.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-047-hostile-and-malformed-feed-fixtures-for-parsegcd` · **Commit:** `DS-047: Hostile and malformed feed fixtures for parseGcdbFeed (broken XML, entity bombs, HTML injection)`

### DS-048 — Extract a source-adapter interface so a second gift-card source can be added safely

**Type:** cleanup · **Priority:** P3 (impact 3 / urgency 1 / confidence 3) · **Effort:** L · **Risk:** medium · **Status:** future
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-20 · **Production approval:** no

**Problem:** parseGcdbFeed/extractOffer are GCDB-specific by name and assumption; adding a second source today means forking the pipeline rather than plugging in an adapter.
**Why it matters:** Source expansion is an explicit product goal; the registry (gift_card_sources) already supports multiple rows but the code path doesn't.
**Current behaviour:** Single hardcoded parser path in the ingest route; source_type column exists ('rss'/'atom'/'api').
**Desired behaviour:** Adapter interface (parse+extract per source_type/source_id) with GCDB as the first implementation, zero behaviour change, chosen by the source row; documented contract for adding source #2.
**Evidence:** gift_card_sources.source_type check constraint · app/api/cron/gift-card-ingest/route.ts single-parser wiring
**Likely files/subsystems:** `lib/giftcards/parseGcdbFeed.ts`, `lib/giftcards/runIngest.ts`, `app/api/cron/gift-card-ingest/route.ts`
**Out of scope:** Actually adding a source (DS-104 research first).
**Blocked by:** DS-014 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Pure refactor: full giftcards suite green with no fixture changes
- New-source checklist documented; second-source stub compiles
**Tests:** npx vitest run tests/giftcards
**Validation:** `npm run lint` && `npx tsc --noEmit` && `npx vitest run` && `npm run build`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** docs/gift-card-pipeline.md modules.
**Branch:** `ds-048-extract-a-source-adapter-interface-so-a-second-g` · **Commit:** `DS-048: Extract a source-adapter interface so a second gift-card source can be added safely`

### DS-049 — Scripted controlled single-ingest test with guaranteed gate re-closure

**Type:** developer-experience · **Priority:** P2 (impact 4 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** medium · **Status:** ready
**Agent:** Opus 4.8 · **Readiness:** Human-gated · **Iteration:** IT-17 · **Production approval:** **yes**

**Problem:** The 2026-07-12 manual test required a hand-sequenced open-gates → force-run → inspect → re-close ritual; forgetting re-closure would silently leave automated fetching enabled — the exact quiet-state-drift failure this repo works hard to prevent.
**Why it matters:** Every future parser change needs a controlled prod test; the risky part (gate handling) should be mechanical.
**Current behaviour:** Manual procedure documented in handoff §M only.
**Desired behaviour:** A script (scripts/controlled-ingest-test.ts) that with explicit confirmation opens the source gates, triggers ?force=1, polls the run row, prints the summary, and ALWAYS re-closes both gates in a finally block, printing post-state as proof.
**Evidence:** docs/OPUS-4.8-HANDOFF.md §M recipe · docs/RECOMMENDED-AUTOMATIONS.md #4 · runGuarded.ts finally-pattern precedent
**Likely files/subsystems:** `scripts/controlled-ingest-test.ts (new file)`, `package.json`
**Out of scope:** Recurring enablement (DS-078 ops, §K Phase 8).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Gates provably closed after success, failure, and Ctrl-C paths (tested with mocked client)
- Requires typed confirmation + CRON_SECRET/service key from env; never prints secrets
- Run summary printed from the run row, not the HTTP body alone
**Tests:** tests/admin/ script-logic tests (pure parts)
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** First real execution requires explicit user approval (production action).
**Rollback/safety:** Gates re-close is the rollback; verify with SELECT. · **Docs:** docs/gift-card-pipeline.md operating section.
**Branch:** `ds-049-scripted-controlled-single-ingest-test-with-guar` · **Commit:** `DS-049: Scripted controlled single-ingest test with guaranteed gate re-closure`

## Epic G — Admin review and editorial workflow (8 tickets)

*Reviewers see diffs, duplicates and context; every decision is fast, audited and reasoned.*

### DS-050 — Side-by-side material-change diff view for 'changed' candidates

**Type:** feature · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-08 · **Production approval:** no

**Problem:** classifyChange stores change_kind and change_diff on re-staged candidates, but the review page renders the candidate flat — the reviewer can't see WHAT changed against the previously approved values without opening the published offer in another tab.
**Why it matters:** Change re-review is the pipeline's core safety loop; making the diff visible is what makes re-review fast and accurate.
**Current behaviour:** gift_card_offer_candidates.change_kind/change_diff columns populated (021) but unrendered in app/admin/(protected)/gift-cards/review/page.tsx.
**Desired behaviour:** Changed candidates render a two-column old→new diff of the changed fields with the change classification badge (material/expiry-extension/eligibility/…), unchanged fields collapsed.
**Evidence:** gift_card_offer_candidates.change_diff column (prod-verified) · lib/giftcards/classifyChange.ts vocabulary
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/review/page.tsx`, `lib/giftcards/classifyChange.ts`
**Out of scope:** Sub-offer diffs (DS-018).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-051, DS-052

**Acceptance criteria:**
- Changed candidate shows per-field old/new values and classification badge
- New (non-changed) candidates render exactly as today
- Unit-tested diff presentation model
**Tests:** tests/giftcards/classifyChange.test.ts; tests/admin/ review presentation tests
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Fixture-driven visual check of a changed candidate.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-050-side-by-side-material-change-diff-view-for-chang` · **Commit:** `DS-050: Side-by-side material-change diff view for 'changed' candidates`

### DS-051 — Candidate-vs-candidate duplicate detection within the review queue

**Type:** feature · **Priority:** P2 (impact 4 / urgency 3 / confidence 5) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-08 · **Production approval:** no

**Problem:** duplicateDetection.ts compares a candidate only against PUBLISHED offers; two overlapping candidates sitting in the queue together (the real Apple pair shape) carry no warning, so approving both in one session double-publishes.
**Why it matters:** The one production duplicate incident to date was exactly this shape; the reviewer had no mechanical warning.
**Current behaviour:** lib/giftcards/duplicateDetection.ts takes PublishedOfferSummary[] only; review page wires published offers in.
**Desired behaviour:** The same verdict engine also runs candidate-vs-candidate across the open queue; the review card shows 'overlaps queued candidate X' warnings; still advisory-only.
**Evidence:** lib/giftcards/duplicateDetection.ts input types · DS-004 incident · app/admin/(protected)/gift-cards/review/actions.ts wiring
**Likely files/subsystems:** `lib/giftcards/duplicateDetection.ts`, `app/admin/(protected)/gift-cards/review/page.tsx`
**Out of scope:** Cross-type dedupe (offers vs signals).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-050

**Acceptance criteria:**
- Queue with two overlapping candidates shows a mutual warning naming the other candidate
- Verdict logic shared (no forked heuristics); unit-tested with the Apple-pair shape
- Nothing is auto-rejected
**Tests:** tests/giftcards/ new duplicateDetection cases
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-051-candidate-vs-candidate-duplicate-detection-withi` · **Commit:** `DS-051: Candidate-vs-candidate duplicate detection within the review queue`

### DS-052 — Require and surface structured rejection reasons on candidate rejection

**Type:** feature · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-08 · **Production approval:** no

**Problem:** rejection_reason exists on candidates but free-text and optional; rejected duplicates/spam/expired items carry no queryable reason, so recurring rejection patterns (parser noise, duplicate floods) are invisible.
**Why it matters:** Rejection reasons are the feedback loop that tunes the extractor and dedupe; unstructured they teach nothing.
**Current behaviour:** gift_card_offer_candidates.rejection_reason nullable free text; review action does not require it.
**Desired behaviour:** Rejection requires a reason from a small taxonomy (duplicate / expired-at-review / not-an-offer / insufficient-data / other+note); reasons aggregated on the admin ops surface.
**Evidence:** rejection_reason column (prod-verified) · app/admin/(protected)/gift-cards/review/actions.ts
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/review/actions.ts`, `app/admin/(protected)/gift-cards/review/page.tsx`
**Out of scope:** Auto-rejection.
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-050

**Acceptance criteria:**
- Reject without reason is impossible (server-validated)
- Reason distribution visible in admin (simple counts)
- Existing rejected rows unaffected
**Tests:** tests/admin/ review action tests
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-052-require-and-surface-structured-rejection-reasons` · **Commit:** `DS-052: Require and surface structured rejection reasons on candidate rejection`

### DS-053 — Reprocess-candidate admin action (re-extract one raw item on demand)

**Type:** feature · **Priority:** P3 (impact 2 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-13 · **Production approval:** no

**Problem:** When the extractor is improved, an admin reviewing a poorly-extracted candidate has no way to re-run extraction for just that item — they must hand-edit every field or wait for a feed change.
**Why it matters:** Complements DS-020 (bulk reprocess) with the surgical per-item version reviewers actually reach for mid-review.
**Current behaviour:** No per-item reprocess action; raw_payload is retained and sufficient.
**Desired behaviour:** A 'Re-extract' button on the candidate card: re-runs extraction from the stored raw_payload, updates the candidate's suggested fields (admin edits preserved or explicitly reset), audited, rate-limited.
**Evidence:** gift_card_raw_items.raw_payload retention · DS-020 reprocess routine
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/review/actions.ts`, `lib/admin/repos/giftCardPipeline.ts`
**Out of scope:** Bulk reprocessing (DS-020).
**Blocked by:** DS-020 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Re-extract updates suggestions without touching review_status
- No network call involved (DI-tested)
- Audit row per reprocess
**Tests:** tests/admin/ action tests
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-053-reprocess-candidate-admin-action-re-extract-one` · **Commit:** `DS-053: Reprocess-candidate admin action (re-extract one raw item on demand)`

### DS-054 — Bulk expiry-correction tool for published gift-card offers

**Type:** feature · **Priority:** P3 (impact 2 / urgency 1 / confidence 4) · **Effort:** M · **Risk:** medium · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-08 · **Production approval:** no

**Problem:** Fixing expiry on many offers (the DS-001 shape, which will recur every catalogue cycle) is one-by-one through the edit form; the existing AdminListTable bulk mechanism (capped 200, one rate-limit unit per batch) is not wired to gift-card offers.
**Why it matters:** Weekly supermarket promos expire in batches; the correction workload is inherently batchy.
**Current behaviour:** AdminListTable `bulk` prop used by feed queue + signals (commit 4c60580); gift-card admin list has no bulk actions.
**Desired behaviour:** Bulk select on /admin/gift-cards with 'set expiry date' and 'unpublish' batch actions, audited per row, same cap/rate-limit semantics as existing bulk actions.
**Evidence:** Admin bulk-actions pattern (memory/commit 4c60580) · components/admin AdminListTable bulk prop
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/page.tsx`, `app/admin/(protected)/gift-cards/actions.ts`
**Out of scope:** Bulk approval of candidates (deliberately excluded — approval stays per-row).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Batch expiry-set and unpublish work on selected rows with per-row audit entries
- Cap 200 + single rate-limit unit preserved
- Server-side validation identical to single edit
**Tests:** tests/admin/ bulk action tests
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Local walkthrough with seeded rows.
**Rollback/safety:** Per-row audit reversal. · **Docs:** None.
**Branch:** `ds-054-bulk-expiry-correction-tool-for-published-gift-c` · **Commit:** `DS-054: Bulk expiry-correction tool for published gift-card offers`

### DS-055 — Product linking during candidate review

**Type:** feature · **Priority:** P2 (impact 3 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** blocked
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-15 · **Production approval:** no

**Problem:** gift_card_offer_candidates.gift_card_product_id exists but the review form offers no product picker, so every approval creates an unlinked offer and the linkage debt (DS-025) regrows with each approval.
**Why it matters:** Stopping the debt at the gate is cheaper than periodic backfills.
**Current behaviour:** Column exists; review UI lacks the control; 0 products exist until DS-022/023/024.
**Desired behaviour:** Review + edit forms include a product (and included-products) picker; approve RPC already carries product_id (021) — verify and wire end-to-end.
**Evidence:** gift_card_offer_candidates.gift_card_product_id column (prod-verified) · 022 included_product_ids on offers
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/review/page.tsx`, `app/admin/(protected)/gift-cards/review/actions.ts`
**Out of scope:** Creating products (DS-022).
**Blocked by:** DS-022 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Approval can set product_id/included_product_ids; persisted through the RPC (integration-shaped test)
- Picker searchable once product count grows; empty state handled
**Tests:** tests/admin/ review action tests
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** Approve one candidate with a product locally.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-055-product-linking-during-candidate-review` · **Commit:** `DS-055: Product linking during candidate review`

### DS-056 — Admin review queue keyboard and accessibility ergonomics

**Type:** accessibility · **Priority:** P3 (impact 2 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-08 · **Production approval:** no

**Problem:** High-volume triage (24 candidates in one session, more once ingestion recurs) is mouse-bound: no keyboard path through approve/reject/skip, focus management untested, and long candidate cards lack landmarks.
**Why it matters:** Review throughput is the pipeline's human bottleneck (ADR-2 consequence); ergonomics is throughput.
**Current behaviour:** No keyboard shortcuts or focus discipline on /admin/gift-cards/review.
**Desired behaviour:** Keyboard navigation between candidates, focus moved to next card after an action, semantic landmarks/labels on cards and action buttons, visible focus states.
**Evidence:** 24-candidate review session 2026-07-12 · app/admin/(protected)/gift-cards/review/page.tsx
**Likely files/subsystems:** `app/admin/(protected)/gift-cards/review/page.tsx`
**Out of scope:** Public a11y (DS-066).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Full review possible without a mouse (documented key map)
- Focus lands on the next candidate after approve/reject
- No axe-critical violations on the review page (ties to DS-094 tooling)
**Tests:** tests/e2e/ keyboard flow (admin bounce test pattern) where feasible
**Validation:** `npm run lint` && `npm run build`
**Manual verification:** Keyboard-only walkthrough.
**Rollback/safety:** Revert. · **Docs:** Key map noted on the page itself.
**Branch:** `ds-056-admin-review-queue-keyboard-and-accessibility-er` · **Commit:** `DS-056: Admin review queue keyboard and accessibility ergonomics`

### DS-057 — Admin banner when code expects columns the connected DB lacks

**Type:** observability · **Priority:** P3 (impact 2 / urgency 1 / confidence 3) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-08 · **Production approval:** no

**Problem:** Repos map 022 columns defensively (missing → null), which keeps pre-migration environments working but SILENTLY — an admin entering a promo code against a DB missing the column would lose the value without warning.
**Why it matters:** The defensive-mapping design is deliberate (handoff §D) but needs an observable counterpart so drift is seen, not swallowed.
**Current behaviour:** lib/admin/repos/giftCardPipeline.ts and offer repos use `?? null` mapping; no drift surfacing in admin.
**Desired behaviour:** A lightweight capability probe (information_schema via service role, cached per deploy) rendering an admin banner naming missing expected columns and the migration that adds them.
**Evidence:** 022 defensive-mapping note in migration header · scripts/verify-schema.ts probe logic to reuse
**Likely files/subsystems:** `lib/admin/repos/dashboard.ts`, `scripts/schema-manifest.ts`
**Out of scope:** Blocking writes (defensive mapping stays).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Banner appears when a known column is absent, naming the migration (manifest-driven)
- Zero overhead when schema is complete (cached)
**Tests:** tests/admin/ probe unit tests
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** Simulate by probing against a column list minus one.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-057-admin-banner-when-code-expects-columns-the-conne` · **Commit:** `DS-057: Admin banner when code expects columns the connected DB lacks`

## Epic H — Stack engine (6 tickets)

*Stack recommendations never claim savings or compatibility the data cannot support.*

### DS-058 — Integrate two-stage acquisition/redemption stackability into stack recommendations

**Type:** feature · **Priority:** P1 (impact 4 / urgency 2 / confidence 4) · **Effort:** L · **Risk:** medium · **Status:** ready
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-09 · **Production approval:** no

**Problem:** The stack engine consumes only evaluateGiftCardCompatibility (single-stage); the richer two-stage analysis (can you EARN on acquiring the card vs can you USE it at the target store) exists in lib/giftcards/stackability.ts but only powers the detail page — so stack recommendations can claim a stack the detail page contradicts.
**Why it matters:** Two surfaces disagreeing about the same stack is a direct false-compatibility risk (priority model P1).
**Current behaviour:** lib/stack/buildStack.ts:30 imports evaluateGiftCardCompatibility; stackability.ts unused in lib/stack/ (grep-verified).
**Desired behaviour:** Stack layers evaluate acquisition and redemption stages via the shared stackability module; warnings and status labels identical across stack cards and detail pages for the same offer+store pair.
**Evidence:** Grep: stackability not imported by lib/stack/ · lib/giftcards/stackability.ts two-stage contract · ADR-7 single-vocabulary decision
**Likely files/subsystems:** `lib/stack/buildStack.ts`, `lib/stack/smartStack.ts`, `lib/giftcards/stackability.ts`
**Out of scope:** New mechanics (DS-063).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Same offer+store pair yields identical status+warnings on /gift-cards/[id] and in stack results (cross-checked in a test)
- No stack recommendation asserts 'compatible' where either stage fails
- Full stack + giftcards suites green
**Tests:** tests/stack/; tests/giftcards/stackability.test.ts; new cross-surface consistency test
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Compare three real offer/store pairs across both surfaces.
**Rollback/safety:** Revert. · **Docs:** docs/OPUS-4.8-HANDOFF.md §B compatibility note.
**Branch:** `ds-058-integrate-two-stage-acquisition-redemption-stack` · **Commit:** `DS-058: Integrate two-stage acquisition/redemption stackability into stack recommendations`

### DS-059 — Surface membership and activation gates as explicit stack warnings

**Type:** feature · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-09 · **Production approval:** no

**Problem:** membership_required/activation_required (021) exist on offers, but stack recommendations don't verifiably warn 'requires Everyday Rewards membership' / 'activate in app first' — a stack that silently assumes membership overstates availability.
**Why it matters:** Gate honesty is cheap here and the columns are already populated by review.
**Current behaviour:** Columns exist; buildStack warning coverage for them unverified/untested.
**Desired behaviour:** Stack layers involving gated offers always carry a gate warning; unit tests pin the behaviour for both flags.
**Evidence:** 021 columns membership_required/activation_required · lib/stack/buildStack.ts warning plumbing
**Likely files/subsystems:** `lib/stack/buildStack.ts`
**Out of scope:** Extraction of gates (DS-017).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-060, DS-061

**Acceptance criteria:**
- Gated-offer fixture produces the warning in stack output (test-pinned for both flags)
- Ungated offers unchanged
**Tests:** tests/stack/buildStack.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-059-surface-membership-and-activation-gates-as-expli` · **Commit:** `DS-059: Surface membership and activation gates as explicit stack warnings`

### DS-060 — Respect uses_per_customer and min_spend in stack maths and warnings

**Type:** feature · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** medium · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-09 · **Production approval:** no

**Problem:** 022 added uses_per_customer and 021 added min_spend, but stack calculations ignore both: a $50 spend can show a saving from a $100-min-spend promo, and per-customer limits never cap projected savings.
**Why it matters:** Savings a user cannot actually obtain are incorrect financial output — the highest-severity class in the priority model once material.
**Current behaviour:** lib/stack/buildStack.ts caps by capDollars only (lines 165-182); min_spend/uses_per_customer unread in stack paths.
**Desired behaviour:** min_spend below the user's spend excludes or warns on the layer; uses_per_customer bounds multi-use assumptions; both surfaced as explicit reasons.
**Evidence:** 021 min_spend / 022 uses_per_customer columns · lib/stack/buildStack.ts cap-only logic
**Likely files/subsystems:** `lib/stack/buildStack.ts`, `lib/stack/smartStack.ts`
**Out of scope:** Multi-card quantity maths (DS-034).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-059

**Acceptance criteria:**
- Below-min-spend fixture never contributes savings (test-pinned)
- Limits appear as warnings with exact values
- No change when fields are null
**Tests:** tests/stack/buildStack.test.ts; tests/stack/ new limit cases
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-060-respect-uses-per-customer-and-min-spend-in-stack` · **Commit:** `DS-060: Respect uses_per_customer and min_spend in stack maths and warnings`

### DS-061 — Test-pin reward-destination separation: stack totals never sum points value as cash

**Type:** testing · **Priority:** P1 (impact 4 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-09 · **Production approval:** no

**Problem:** The valuation engine separates cash savings from points estimates by design (ADR-6), but no test asserts the stack TOTAL keeps them separate — a future refactor could silently add estimated points value into the headline dollar saving.
**Why it matters:** Points-as-cash is the most misleading possible number on the site; this invariant deserves a permanent tripwire, not convention.
**Current behaviour:** lib/giftcards/value.ts separates figures; tests/stack/ has no explicit total-separation invariant test.
**Desired behaviour:** Property-style tests: for any stack containing points layers, headline cash saving equals the same stack with points layers' estimates zeroed; points value only ever appears in its labelled field.
**Evidence:** ADR-6 in docs/DEALSTACK-DECISIONS.md · lib/stack/outcome.ts totals assembly
**Likely files/subsystems:** `tests/stack/buildStack.test.ts`, `lib/stack/outcome.ts`
**Out of scope:** Changing valuation itself.
**Blocked by:** — · **Blocks:** DS-063 · **Parallel with:** DS-059, DS-096

**Acceptance criteria:**
- Invariant test in place and failing if points leak into cash totals (verified by temporary mutation)
- Covers buildStack and smartStack outputs
**Tests:** tests/stack/ new invariant tests
**Validation:** `npx vitest run tests/stack`
**Manual verification:** None.
**Rollback/safety:** n/a (test-only). · **Docs:** None.
**Branch:** `ds-061-test-pin-reward-destination-separation-stack-tot` · **Commit:** `DS-061: Test-pin reward-destination separation: stack totals never sum points value as cash`

### DS-062 — Render uncertainty explanations for requires-verification / insufficient-evidence stack layers

**Type:** feature · **Priority:** P2 (impact 3 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-09 · **Production approval:** no

**Problem:** Compatibility results carry a reason string and warnings, but stack UI reduces uncertain statuses to a label — users see 'Requires verification' without WHAT to verify, which the data already knows.
**Why it matters:** Actionable uncertainty ('check the card is accepted at JB Hi-Fi — no acceptance evidence recorded') is the honest-UX contract of ADR-10.
**Current behaviour:** GiftCardCompatibilityResult.reason/warnings exist (lib/giftcards/compatibility.ts:33-38); StackRecommendationCard shows status labels.
**Desired behaviour:** Uncertain layers expand to show the reason and top warnings on stack cards and the calculator, phrased as verification steps.
**Evidence:** lib/giftcards/compatibility.ts result shape · components/StackRecommendationCard.tsx
**Likely files/subsystems:** `components/StackRecommendationCard.tsx`, `lib/stack/present.ts`
**Out of scope:** New statuses.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- requires-verification/insufficient-evidence layers show reason + warnings (fixture-tested view-model)
- Compatible layers unchanged (no noise)
**Tests:** tests/stack/ presentation tests
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Visual pass on a stack containing an uncertain layer.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-062-render-uncertainty-explanations-for-requires-ver` · **Commit:** `DS-062: Render uncertainty explanations for requires-verification / insufficient-evidence stack layers`

### DS-063 — Stack support for fixed-dollar, promo-credit and fee-waiver mechanics

**Type:** feature · **Priority:** P3 (impact 3 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** medium · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-14 · **Production approval:** no

**Problem:** Once DS-015/DS-016 introduce new mechanics, the stack engine must incorporate fixed-dollar discounts into cash totals while keeping credits/waivers OUT of the headline (reward-destination rule).
**Why it matters:** Mechanics that exist publicly but not in stack maths make Smart Stack undercount honestly-stackable savings — or worse, someone wires them in wrongly later.
**Current behaviour:** Stack layers know percent/bonus/points only.
**Desired behaviour:** Fixed-dollar joins cash-saving maths (min_spend-aware via DS-060); credit/waiver render as separate labelled value lines, never in the cash total (extends DS-061 invariant).
**Evidence:** DS-015/DS-016 mechanics · DS-061 separation invariant
**Likely files/subsystems:** `lib/stack/buildStack.ts`, `lib/giftcards/value.ts`
**Out of scope:** n/a.
**Blocked by:** DS-015, DS-016, DS-061 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Each mechanic has stack fixtures with pinned expected totals
- DS-061 invariant extended to credits/waivers and green
**Tests:** tests/stack/; tests/giftcards/value.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-063-stack-support-for-fixed-dollar-promo-credit-and` · **Commit:** `DS-063: Stack support for fixed-dollar, promo-credit and fee-waiver mechanics`

## Epic I — Public UX (7 tickets)

*Gift-card surfaces are accessible, honest in every state, and discoverable.*

### DS-064 — JSON-LD structured data on gift-card listing and detail pages

**Type:** feature · **Priority:** P2 (impact 3 / urgency 2 / confidence 5) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-10 · **Production approval:** no

**Problem:** The site ships JSON-LD elsewhere (components/JsonLd.tsx, lib/structuredData.ts) but /gift-cards and /gift-cards/[id] emit none — the newest public surface is invisible to rich results.
**Why it matters:** Structured data is the established SEO pattern of this repo; the gap is an oversight, not a decision.
**Current behaviour:** Grep-verified: no JsonLd/ld+json usage under app/gift-cards/.
**Desired behaviour:** Offer/ItemList JSON-LD on listing and detail, from the same view-model values users see (never raw fields), with expiry and price honesty (no invented priceValidUntil when expiry is null).
**Evidence:** components/JsonLd.tsx · lib/structuredData.ts site precedent · grep result: none under app/gift-cards/
**Likely files/subsystems:** `app/gift-cards/page.tsx`, `app/gift-cards/[id]/page.tsx`, `lib/structuredData.ts`
**Out of scope:** OG images (DS-065).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-065

**Acceptance criteria:**
- Valid JSON-LD on both routes (validated in test by parsing the emitted script)
- Null expiry emits no priceValidUntil
- Smoke SEO checks extended to the routes
**Tests:** tests/giftcards/ structured-data tests; npm run smoke
**Validation:** `npm run lint` && `npx vitest run` && `npm run build` && `npm run smoke -- --base-url=http://localhost:3000`
**Manual verification:** Rich-results test on one deployed URL post-merge.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-064-json-ld-structured-data-on-gift-card-listing-and` · **Commit:** `DS-064: JSON-LD structured data on gift-card listing and detail pages`

### DS-065 — Open Graph metadata and generated OG images for gift-card pages

**Type:** feature · **Priority:** P3 (impact 2 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-10 · **Production approval:** no

**Problem:** Deals/stores pages have generated OG images (commit 54fe741 pattern via opengraph-image.tsx); gift-card pages share the generic site card, so shared links carry no offer context.
**Why it matters:** Gift-card promos are the most share-worthy content (time-boxed savings).
**Current behaviour:** No route-level opengraph-image or metadata specialisation under app/gift-cards/.
**Desired behaviour:** Detail pages emit offer-specific title/description metadata and a generated OG image from view-model values (brandPrimary, value badge, seller), consistent with the existing OG design.
**Evidence:** app/opengraph-image.tsx site pattern · lib/giftcards/offerCardViewModel.ts fields
**Likely files/subsystems:** `app/gift-cards/[id]/page.tsx`, `app/gift-cards/[id]/opengraph-image.tsx (new file)`
**Out of scope:** Social share buttons.
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-064

**Acceptance criteria:**
- Detail route serves a per-offer OG image and metadata
- Long brand lists truncate exactly as the card does (view-model reuse)
- No regression to site-level OG
**Tests:** npm run smoke (header/meta checks)
**Validation:** `npm run lint` && `npm run build` && `npm run smoke -- --base-url=http://localhost:3000`
**Manual verification:** Preview one URL in an OG debugger post-deploy.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-065-open-graph-metadata-and-generated-og-images-for` · **Commit:** `DS-065: Open Graph metadata and generated OG images for gift-card pages`

### DS-066 — Accessibility audit and fixes for /gift-cards listing and detail pages

**Type:** accessibility · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-10 · **Production approval:** no

**Problem:** The gift-card surfaces shipped fast (view-model refactor landed same-day as handoff) with no recorded accessibility pass: badge/pill contrast, tab/filter keyboard operation, screen-reader labels for value badges ('20× POINTS'), and heading structure are unverified.
**Why it matters:** Accessibility is a launch-quality bar the older pages went through; the newest surface skipped it.
**Current behaviour:** No audit record; no automated a11y checks exist repo-wide (no axe dependency — grep-verified).
**Desired behaviour:** Manual WCAG AA pass (contrast, keyboard, SR labels, headings, focus) with fixes; machine-checkable follow-through lands via DS-094.
**Evidence:** No axe in package.json (grep) · components/GiftCardOfferCard.tsx badge rendering · commit 1d7b87a recency
**Likely files/subsystems:** `components/GiftCardOfferCard.tsx`, `components/GiftCardsClient.tsx`, `app/gift-cards/[id]/page.tsx`
**Out of scope:** Automated axe harness (DS-094); admin a11y (DS-056).
**Blocked by:** — · **Blocks:** DS-069 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Documented audit checklist with per-item pass/fixed status
- Value badges carry SR-meaningful labels; tabs/filters fully keyboard-operable; AA contrast on badges in both themes
**Tests:** tests/e2e/public-flows.spec.ts keyboard cases
**Validation:** `npm run lint` && `npm run build` && `npm run test:e2e`
**Manual verification:** Keyboard-only + VoiceOver walkthrough of both pages.
**Rollback/safety:** Revert. · **Docs:** Audit notes in the PR/commit body.
**Branch:** `ds-066-accessibility-audit-and-fixes-for-gift-cards-lis` · **Commit:** `DS-066: Accessibility audit and fixes for /gift-cards listing and detail pages`

### DS-067 — Honest empty and degraded states for /gift-cards

**Type:** feature · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-10 · **Production approval:** no

**Problem:** When every offer expires (13 rows, 7 undated — plausible within weeks) or the DB read fails closed, the listing's zero-state is unspecified: fail-closed policy guarantees no demo rows, but what renders may be a bare grid with no explanation.
**Why it matters:** An unexplained empty page reads as broken; an explained one preserves trust — this exact scenario WILL occur given current expiry clustering.
**Current behaviour:** lib/repos read paths fail closed (ADR-15); zero-state copy/e2e coverage for /gift-cards unverified.
**Desired behaviour:** Distinct, tested states: 'no current offers' (with what to expect), filter-produced-empty ('no matches — clear filters'), and error-degraded; all with Australian-English copy.
**Evidence:** ADR-15 fail-closed decision · Prod expiry clustering (handoff §J)
**Likely files/subsystems:** `components/GiftCardsClient.tsx`, `app/gift-cards/page.tsx`
**Out of scope:** Full failing-Supabase e2e harness (DS-095).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Three states render distinct copy (unit/e2e-tested)
- No layout collapse; filters remain operable in empty states
**Tests:** tests/giftcards/publicQuery.test.ts; tests/e2e/public-flows.spec.ts
**Validation:** `npm run lint` && `npx vitest run` && `npm run build` && `npm run test:e2e`
**Manual verification:** Force each state locally.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-067-honest-empty-and-degraded-states-for-gift-cards` · **Commit:** `DS-067: Honest empty and degraded states for /gift-cards`

### DS-068 — Consistent stale-data badge on gift-card surfaces past the 21-day threshold

**Type:** feature · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-10 · **Production approval:** no

**Problem:** STALE_DATA_DAYS=21 governs stack-engine trust, but a public gift-card card/detail for a row last checked 8 weeks ago (the live gc-restaurant-cafe-choice shape) shows no freshness cue.
**Why it matters:** Freshness transparency is how the site earns the right to be wrong occasionally; hiding staleness converts data rot into betrayal.
**Current behaviour:** View-model exposes trust labels but no last-checked-based staleness signal on public gift-card surfaces.
**Desired behaviour:** Cards and detail pages show 'Last verified <date>' with a visually distinct stale treatment past 21 days, sourced from the shared threshold constant (single source).
**Evidence:** lib/stack/compatibility.ts:26 STALE_DATA_DAYS · Prod row last_checked 2026-05-20 while confirmed
**Likely files/subsystems:** `lib/giftcards/offerCardViewModel.ts`, `components/GiftCardOfferCard.tsx`, `app/gift-cards/[id]/page.tsx`
**Out of scope:** Admin staleness flags (DS-009).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Stale fixture renders the stale treatment; fresh fixture doesn't (view-model unit tests)
- Same constant consumed everywhere (no second 21)
**Tests:** tests/giftcards/offerCardViewModel.test.ts
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Visual check both themes.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-068-consistent-stale-data-badge-on-gift-card-surface` · **Commit:** `DS-068: Consistent stale-data badge on gift-card surfaces past the 21-day threshold`

### DS-069 — Mobile filter/sort drawer for the gift-card listing

**Type:** feature · **Priority:** P3 (impact 2 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-11 · **Production approval:** no

**Problem:** Tabs, four sorts and filters from publicQuery render as desktop-oriented controls; on mobile they consume the first viewport and push offers below the fold.
**Why it matters:** Deal-hunting is disproportionately mobile; the mobile-chromium e2e project exists precisely because of this.
**Current behaviour:** lib/giftcards/publicQuery.ts URL-state controls rendered inline by GiftCardsClient.
**Desired behaviour:** Mobile-width drawer/sheet pattern for filters+sort (URL-state preserved, shareable links unchanged), offers visible in the first viewport.
**Evidence:** playwright.config.ts mobile-chromium project · lib/giftcards/publicQuery.ts URL contract
**Likely files/subsystems:** `components/GiftCardsClient.tsx`
**Out of scope:** Desktop layout changes.
**Blocked by:** DS-066 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Mobile e2e: offers visible above the fold; drawer operates by touch and keyboard
- URL state identical to desktop (same publicQuery params)
**Tests:** tests/e2e/public-flows.spec.ts mobile cases
**Validation:** `npm run lint` && `npm run build` && `npm run test:e2e`
**Manual verification:** Visual pass at 375px and 768px.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-069-mobile-filter-sort-drawer-for-the-gift-card-list` · **Commit:** `DS-069: Mobile filter/sort drawer for the gift-card listing`

### DS-070 — Same-brand cross-seller comparison on gift-card surfaces

**Type:** feature · **Priority:** P3 (impact 3 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-11 · **Production approval:** no

**Problem:** Apple cards are live at two sellers with different mechanics (20× Everyday Rewards at Big W vs 20× Flybuys at Coles) but each renders as an unrelated card — the buyer's actual question ('where should I buy an Apple card this week?') goes unanswered.
**Why it matters:** Comparison is the site's founding pattern (multi-retailer product comparison exists for signals, migration 014); gift cards have the data but not the view.
**Current behaviour:** No brand grouping on /gift-cards; the two live Apple rows prove the shape (prod-verified).
**Desired behaviour:** Listing groups same-brand offers from multiple sellers into a comparison row using the shared valuation engine for effective-saving ordering, with per-seller mechanics honestly distinguished (cash vs points estimate).
**Evidence:** Prod rows gc-apple-big-w / gc-apple-coles · Smart Stack comparison precedent (PROJECT_STATE §4 multi-retailer) · lib/giftcards/value.ts single engine
**Likely files/subsystems:** `lib/giftcards/publicQuery.ts`, `components/GiftCardsClient.tsx`
**Out of scope:** Cross-type comparison (cashback vs gift card).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Brands with 2+ sellers render a grouped comparison ordered by effective saving
- Points-vs-cash never ranked as equivalent without the disclosed cents-per-point label
- Single-seller brands unchanged
**Tests:** tests/giftcards/publicQuery.test.ts grouping cases
**Validation:** `npm run lint` && `npx vitest run` && `npm run build` && `npm run test:e2e`
**Manual verification:** Visual pass with the live Apple pair shape.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-070-same-brand-cross-seller-comparison-on-gift-card` · **Commit:** `DS-070: Same-brand cross-seller comparison on gift-card surfaces`

## Epic J — Monitoring and operations (8 tickets)

*Pipeline state is glanceable, alerting is real, and every risky action has a runbook.*

### DS-071 — Gift-card pipeline status card on /admin/monitor (runs, gates, next expected run)

**Type:** observability · **Priority:** P1 (impact 4 / urgency 3 / confidence 5) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-07 · **Production approval:** no

**Problem:** /admin/monitor shows OzBargain monitor and detection status but nothing about the gift-card pipeline: gate states, last run outcome, queue depth and next expected run window are invisible without SQL.
**Why it matters:** Before recurring ingestion can be responsibly enabled (§K Phase 8), ops needs one glanceable surface; today even the 2026-07-12 test run's outcome required a DB query to see.
**Current behaviour:** lib/admin/repos/monitorStatus.ts covers feed monitor only; gift_card_ingest_runs/gift_card_sources unrendered.
**Desired behaviour:** A status card: source gates (env flag readable? both DB booleans), last run (status, counts, duration), queue depth by review_status, oldest unreviewed candidate age, and the next valid run window computed from schedule.ts.
**Evidence:** app/admin/(protected)/monitor/page.tsx detection-card precedent (d499d7e) · lib/giftcards/schedule.ts window logic · prod run d5fed777 needed SQL to inspect
**Likely files/subsystems:** `lib/admin/repos/giftCardPipeline.ts`, `app/admin/(protected)/monitor/page.tsx`, `lib/admin/repos/monitorStatus.ts`
**Out of scope:** External alerting (DS-073/DS-075).
**Blocked by:** — · **Blocks:** DS-077 · **Parallel with:** DS-009

**Acceptance criteria:**
- Card renders all listed facts from service-role reads; no network calls
- Next-window computation reuses schedule.ts (no duplicated Sydney logic)
- Unit tests for the status assembly
**Tests:** tests/admin/ status repo tests; tests/giftcards/schedule.test.ts reuse
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** View against local DB snapshot.
**Rollback/safety:** Revert. · **Docs:** docs/gift-card-pipeline.md ops section.
**Branch:** `ds-071-gift-card-pipeline-status-card-on-admin-monitor` · **Commit:** `DS-071: Gift-card pipeline status card on /admin/monitor (runs, gates, next expected run)`

### DS-072 — Extend health endpoints with gift-card pipeline freshness and review-backlog signals

**Type:** observability · **Priority:** P2 (impact 4 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-07 · **Production approval:** no

**Problem:** /api/health/monitor and /api/health/data know nothing of the gift-card pipeline — a stalled ingest (once enabled), a stuck run, or a 3-week-old unreviewed candidate backlog would never turn the external health probe red.
**Why it matters:** Monitoring blindness is P1-class in the priority model; the endpoint exists, the signals don't.
**Current behaviour:** lib/monitor/health.ts covers feed monitor; gift-card tables unprobed.
**Desired behaviour:** Health additions (bearer-gated, read-only): last-non-skip ingest age vs expectation WHEN gates are enabled (healthy when disabled), running-state age (stuck detection), pending-candidate count + oldest age thresholds; wired into the same 2xx/503 contract.
**Evidence:** app/api/health/monitor/route.ts contract · docs/OPUS-4.8-HANDOFF.md unresolved risk: 15 aging candidates
**Likely files/subsystems:** `lib/monitor/health.ts`, `app/api/health/data/route.ts`, `lib/admin/repos/giftCardPipeline.ts`
**Out of scope:** Workflow wiring (DS-073).
**Blocked by:** — · **Blocks:** DS-073 · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Gates-closed state reports healthy (no false alarms while dormant)
- Stuck 'running' run older than threshold → 503 with machine-readable reason
- Thresholds unit-tested via injected clock
**Tests:** tests/monitor/ or tests/giftcards/ health tests
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** curl both endpoints locally with fixture states.
**Rollback/safety:** Revert. · **Docs:** docs/gift-card-pipeline.md ops; runbook (DS-076).
**Branch:** `ds-072-extend-health-endpoints-with-gift-card-pipeline` · **Commit:** `DS-072: Extend health endpoints with gift-card pipeline freshness and review-backlog signals`

### DS-073 — Point the scheduled health workflow at the extended gift-card signals

**Type:** operations · **Priority:** P2 (impact 3 / urgency 1 / confidence 4) · **Effort:** XS · **Risk:** low · **Status:** blocked
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-07 · **Production approval:** no

**Problem:** monitor-health.yml probes the two existing endpoints; once DS-072 adds gift-card signals the workflow needs no change ONLY if signals ride the existing endpoints — verify and, if a new endpoint was added instead, probe it with the same exit-code contract.
**Why it matters:** An unprobed health signal is decoration.
**Current behaviour:** .github/workflows/monitor-health.yml probes /api/health/monitor and /api/health/data every 3h.
**Desired behaviour:** Workflow provably covers gift-card health (same blind-check exit-2 discipline, status-code-only logging).
**Evidence:** .github/workflows/monitor-health.yml exit contract · DS-072
**Likely files/subsystems:** `.github/workflows/monitor-health.yml`
**Out of scope:** New alert channels.
**Blocked by:** DS-072 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- A forced unhealthy gift-card state turns a workflow run red
- No response bodies logged (public repo rule preserved)
**Validation:** `Manual workflow dispatch after merge`
**Manual verification:** One dispatch with a simulated unhealthy threshold (staging value).
**Rollback/safety:** Revert workflow lines. · **Docs:** Runbook (DS-076).
**Branch:** `ds-073-point-the-scheduled-health-workflow-at-the-exten` · **Commit:** `DS-073: Point the scheduled health workflow at the extended gift-card signals`

### DS-074 — Expiring-offers digest on the admin dashboard (72-hour window)

**Type:** observability · **Priority:** P2 (impact 3 / urgency 2 / confidence 5) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-07 · **Production approval:** no

**Problem:** Offers lapse silently (RLS hides them at expiry) — correct but invisible: DS-005's two near-expiry rows were discovered by ad-hoc SQL. A 72h-window query already exists in the repo (giftCardPipeline.ts in72h helper) but reaches no surface.
**Why it matters:** 'Re-verify or let lapse' is a recurring decision; it needs a standing surface, not an agent noticing.
**Current behaviour:** lib/admin/repos/giftCardPipeline.ts:569 computes the 72h horizon; dashboard shows no expiring list.
**Desired behaviour:** Dashboard section listing published offers (all types with expiry semantics — gift cards first) expiring within 72h, with one-click links to edit/re-verify.
**Evidence:** lib/admin/repos/giftCardPipeline.ts:569 · DS-005 incident shape
**Likely files/subsystems:** `lib/admin/repos/dashboard.ts`, `app/admin/(protected)/dashboard/page.tsx`, `lib/admin/repos/giftCardPipeline.ts`
**Out of scope:** Email/webhook delivery (DS-075).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-071

**Acceptance criteria:**
- Expiring-in-72h fixture rows listed with days-remaining and edit links
- Empty state when nothing expires; unit-tested via injected clock
**Tests:** tests/admin/ dashboard tests
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** View against snapshot containing near-expiry rows.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-074-expiring-offers-digest-on-the-admin-dashboard-72` · **Commit:** `DS-074: Expiring-offers digest on the admin dashboard (72-hour window)`

### DS-075 — Route pipeline warnings through the existing ops webhook (ALERT_WEBHOOK_URL)

**Type:** observability · **Priority:** P3 (impact 2 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-07 · **Production approval:** no

**Problem:** instrumentation.ts posts server ERRORS to ALERT_WEBHOOK_URL, but operational WARNINGS with no exception — zero-item runs (DS-041), rejection spikes (DS-045), auto-pause (DS-044) — reach no one unless an admin happens to look.
**Why it matters:** The webhook plumbing (dedupe, 5-min window) already exists; warnings are one call away from being alerts.
**Current behaviour:** lib/observability/report-server-error.ts error-only path.
**Desired behaviour:** A reportOpsWarning helper reusing the dedupe/window plumbing; ingest warning paths call it; silent when the env var is unset (existing contract).
**Evidence:** lib/observability/report-server-error.ts dedupe design · .env.example ALERT_WEBHOOK_URL section
**Likely files/subsystems:** `lib/observability/report-server-error.ts`, `lib/giftcards/runIngest.ts`
**Out of scope:** New channels; paging policy.
**Blocked by:** DS-041 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Warning fixtures produce exactly one webhook call per dedupe window (DI-tested)
- Unset env → no-op, no error
**Tests:** tests/giftcards/ or tests/admin/ observability tests
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** One test post to a scratch webhook.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-075-route-pipeline-warnings-through-the-existing-ops` · **Commit:** `DS-075: Route pipeline warnings through the existing ops webhook (ALERT_WEBHOOK_URL)`

### DS-076 — Gift-card pipeline go-live and rollback runbook

**Type:** documentation · **Priority:** P2 (impact 3 / urgency 2 / confidence 5) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-07 · **Production approval:** no

**Problem:** The OzBargain monitor has a written go-live/rollback runbook (docs/ozbargain-monitoring.md) that gated its activation; the gift-card pipeline — closer to activation than detection ever was — has operating notes scattered across the pipeline doc and handoff §K/§M but no single runbook.
**Why it matters:** Phase 8 (recurring enablement) is a human ops act; humans follow runbooks, not scattered sections.
**Current behaviour:** docs/gift-card-pipeline.md 'Operating the pipeline' 5-step list; no failure playbook, no rollback drill, no verification checklist.
**Desired behaviour:** docs/gift-card-ingest-runbook.md: pre-enable checklist (robots/terms stamps, UA, env), enable sequence, first-two-runs observation guide, failure playbook (stuck run, streak, block), emergency stop, full rollback, and the §M no-public-change verification recipe.
**Evidence:** docs/ozbargain-monitoring.md runbook precedent · docs/OPUS-4.8-HANDOFF.md §K Phase 8 / §M recipes
**Likely files/subsystems:** `docs/gift-card-ingest-runbook.md (new file)`, `docs/gift-card-pipeline.md`
**Out of scope:** Actually enabling (Iteration 17 / Phase 8).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- A competent operator can enable, observe, and fully roll back using only the runbook
- Every command copy-pasteable; no secrets in examples
**Validation:** `git diff --check`
**Manual verification:** Dry-read walkthrough against a closed-gates prod state.
**Rollback/safety:** n/a (doc). · **Docs:** This IS the doc; link from gift-card-pipeline.md.
**Branch:** `ds-076-gift-card-pipeline-go-live-and-rollback-runbook` · **Commit:** `DS-076: Gift-card pipeline go-live and rollback runbook`

### DS-077 — One-click emergency stop for the gift-card source (audited)

**Type:** operations · **Priority:** P2 (impact 3 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-07 · **Production approval:** no

**Problem:** The feed monitor has an audited one-click emergency stop (commit f65c951); stopping gift-card ingestion today means a manual DB update or Vercel env change — slow exactly when speed matters (a complaint from the source, runaway behaviour).
**Why it matters:** Mirror of an existing, proven control; asymmetry between the two pipelines is unjustified.
**Current behaviour:** Monitor emergency stop exists on /admin/monitor; no gift-card equivalent.
**Desired behaviour:** Button on the DS-071 status card: sets gift_card_sources enabled=false AND automated_fetch_allowed=false, rate-limited, audited, preserving staged/public content — identical semantics to the monitor stop.
**Evidence:** Monitor emergency stop (f65c951, PROJECT_STATE §4) · gift_card_sources gate columns
**Likely files/subsystems:** `app/admin/(protected)/monitor/page.tsx`, `lib/admin/repos/giftCardPipeline.ts`
**Out of scope:** Env-flag control (Vercel-side, human).
**Blocked by:** DS-071 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- One click closes both DB gates with an audit row; UI reflects closed state immediately
- Staged candidates and published offers untouched (test-asserted)
- Rate-limited like other admin actions
**Tests:** tests/admin/ action tests
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Local click-through.
**Rollback/safety:** Re-enable is deliberately manual (runbook). · **Docs:** Runbook (DS-076).
**Branch:** `ds-077-one-click-emergency-stop-for-the-gift-card-sourc` · **Commit:** `DS-077: One-click emergency stop for the gift-card source (audited)`

### DS-078 — Ops: confirm Actions secrets exist and drive all four scheduled workflows to green

**Type:** operations · **Priority:** P1 (impact 4 / urgency 3 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** needs-production-evidence
**Agent:** human/admin · **Readiness:** Human-gated · **Iteration:** IT-17 · **Production approval:** **yes**

**Problem:** Four scheduled workflows (ci on push, schema-drift weekly, monitor-health 3-hourly, gift-card-ingest daily) depend on repository secrets (CRON_SECRET; NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for drift) whose existence cannot be verified from the repo — workflows are DESIGNED to run red (exit 2) when blind, and the launch checklist still lists secret creation as open.
**Why it matters:** Every observability ticket lands on this plumbing; red-by-design becomes alarm fatigue if left unconfigured.
**Current behaviour:** docs/launch-management/FINAL-LAUNCH-CHECKLIST.md §3 lists the secrets as human setup; run history unverifiable from repo.
**Desired behaviour:** All secrets confirmed present; one manual dispatch each of schema-drift and monitor-health ends green; failure-notification delivery to the owner confirmed once (a deliberate red).
**Evidence:** .github/workflows/*.yml exit-2 blind contracts · FINAL-LAUNCH-CHECKLIST §3-4 open items
**Likely files/subsystems:** `docs/launch-management/FINAL-LAUNCH-CHECKLIST.md`
**Out of scope:** cron-job.org alternative (documented option, separate decision).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Screenshot/note of green dispatches recorded in the checklist
- One deliberate failure notification received (proves the alert channel)
- Checklist items ticked with dates
**Validation:** `GitHub Actions run history`
**Manual verification:** Entirely manual (GitHub settings + dispatches).
**Rollback/safety:** n/a. · **Docs:** FINAL-LAUNCH-CHECKLIST updates.
**Branch:** `ds-078-ops-confirm-actions-secrets-exist-and-drive-all` · **Commit:** `DS-078: Ops: confirm Actions secrets exist and drive all four scheduled workflows to green`

## Epic K — Security and trust (7 tickets)

*Trust boundaries are mechanically verified, not just designed.*

### DS-079 — Automated RLS assertion probe: anon role must not read staging tables

**Type:** security · **Priority:** P1 (impact 5 / urgency 3 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Opus 4.8 · **Readiness:** Codex-ready · **Iteration:** IT-05 · **Production approval:** no

**Problem:** The trust model rests on 18 service-role-only tables being unreadable to anon, but nothing continuously asserts it — verify:schema probes column EXISTENCE with the service key; an accidentally-added anon SELECT policy on gift_card_raw_items would ship silently.
**Why it matters:** Raw/unapproved content becoming public is the P0 scenario in the priority model; this probe converts it from 'policy we believe' to 'invariant we test weekly'.
**Current behaviour:** scripts/verify-schema.ts (service-role, existence only); RLS policy state untested anywhere.
**Desired behaviour:** Extend the probe (or add scripts/verify-rls.ts): with the ANON key, attempt SELECT on every service-role-only table from a manifest-driven list — any row visibility or non-denial error fails; public tables assert published-only visibility. Wire into schema-drift.yml.
**Evidence:** docs/OPUS-4.8-HANDOFF.json serviceRoleOnly list (18 tables) · scripts/verify-schema.ts probe harness · .github/workflows/schema-drift.yml weekly slot
**Likely files/subsystems:** `scripts/verify-schema.ts`, `scripts/schema-manifest.ts`, `.github/workflows/schema-drift.yml`
**Out of scope:** Changing any RLS policy.
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-080

**Acceptance criteria:**
- Probe fails loudly if any staging table returns rows to anon (verified by temporarily simulating with a mock)
- Runs in schema-drift workflow on Node 22 with the same exit-code contract (0/1/2)
- Table list driven from schema-manifest, so new tables can't be forgotten (self-audit test)
**Tests:** tests/admin/schemaManifest.test.ts extension
**Validation:** `npm run lint` && `npx vitest run` && `node 22: npm run verify:schema`
**Manual verification:** One manual run against prod (read-only by construction).
**Rollback/safety:** Revert; read-only tooling. · **Docs:** FINAL-LAUNCH-CHECKLIST §2 references the probe.
**Branch:** `ds-079-automated-rls-assertion-probe-anon-role-must-not` · **Commit:** `DS-079: Automated RLS assertion probe: anon role must not read staging tables`

### DS-080 — RPC privilege audit probe: security-definer functions locked to service_role with pinned search_path

**Type:** security · **Priority:** P1 (impact 4 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-05 · **Production approval:** no

**Problem:** approve_gift_card_candidate (and the other definer RPCs from 010/011/015/020) must stay granted to service_role only with search_path pinned — the 008 incident (mutable search_path advisor WARN) shows this class drifts, and a future 'create or replace' can silently reset grants.
**Why it matters:** A definer RPC executable by anon IS the approval-boundary bypass; grant state deserves the same weekly probing as schema shape.
**Current behaviour:** Grants asserted only in migration SQL; no runtime verification. Migration 013 precedent (revoking trigger-function execute) shows the concern is real.
**Desired behaviour:** Probe queries pg_proc/information_schema routine privileges for every definer function: EXECUTE not granted to anon/authenticated, proconfig contains pinned search_path; manifest-listed so new RPCs are covered.
**Evidence:** Migration 008 search_path incident · Migration 013 execute-revocation precedent · 021/022 revoke/grant blocks
**Likely files/subsystems:** `scripts/verify-schema.ts`, `scripts/schema-manifest.ts`
**Out of scope:** Changing grants (only detecting).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-079

**Acceptance criteria:**
- Probe fails on anon-executable definer function or unpinned search_path
- Covers all definer functions from migrations 010,011,015,016,020,021,022
- Runs alongside DS-079 in the weekly workflow
**Tests:** tests/admin/ manifest coverage test
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** One prod run (read-only catalog queries).
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-080-rpc-privilege-audit-probe-security-definer-funct` · **Commit:** `DS-080: RPC privilege audit probe: security-definer functions locked to service_role with pinned search_path`

### DS-081 — Log-redaction review of ingest error paths and workflow logs

**Type:** security · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-05 · **Production approval:** no

**Problem:** gift_card_ingest_runs.error_summary and [server-error] log lines can carry arbitrary upstream content (response fragments, URLs with tokens); the ingest workflow logs to a PUBLIC repo — the workflow already whitelists summary keys, but the route's error strings and webhook payloads have no length/content discipline.
**Why it matters:** One verbose error embedding a feed body fragment in a public Actions log leaks content we promised never to republish (ADR-9) — and secrets travel in URLs more often than anyone admits.
**Current behaviour:** Workflow logs whitelisted keys only (gift-card-ingest.yml python step); error_summary set from exception messages unbounded; report-server-error webhook posts digest+message.
**Desired behaviour:** Error strings bounded (length cap) and stripped of response-body content and URL query strings before persistence/webhook; a unit test feeds a hostile error and asserts redaction.
**Evidence:** .github/workflows/gift-card-ingest.yml whitelist step · lib/observability/report-server-error.ts · runGuarded fail(message) path
**Likely files/subsystems:** `lib/giftcards/runGuarded.ts`, `lib/observability/report-server-error.ts`, `app/api/cron/gift-card-ingest/route.ts`
**Out of scope:** Vercel function-log retention policy.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Hostile error fixture (body fragment + tokened URL) persists redacted and bounded
- Webhook payload same discipline; workflow logging unchanged (already safe)
**Tests:** tests/giftcards/runGuarded.test.ts; tests/admin/ observability tests
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-081-log-redaction-review-of-ingest-error-paths-and-w` · **Commit:** `DS-081: Log-redaction review of ingest error paths and workflow logs`

### DS-082 — Evaluate promoting CSP from report-only to enforced

**Type:** security · **Priority:** P2 (impact 3 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** medium · **Status:** needs-design
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-05 · **Production approval:** **yes**

**Problem:** The nonce-based CSP ships as Report-Only (per the 2026-07-11 backlog close); violations are collected at /api/csp-report but the policy blocks nothing — XSS defence-in-depth is announced, not active.
**Why it matters:** Report-only was the right rollout stage; staying there indefinitely forfeits the protection while paying its complexity cost.
**Current behaviour:** CSP-RO with nonce; /api/csp-report endpoint with rate limiting exists; dev-server nonce noise documented as a known non-issue (handoff §H).
**Desired behaviour:** Review accumulated violation reports; fix any genuine violations; flip to enforcing CSP for production responses with a documented rollback (header name change); keep RO in dev.
**Evidence:** Memory: nonce CSP-RO shipped in the 20-item backlog (1cd9faa) · app/api/csp-report/route.ts · handoff §H dev-noise trap
**Likely files/subsystems:** `middleware or next.config header source (locate at implementation)`, `app/api/csp-report/route.ts`
**Out of scope:** Third-party script policy changes (none exist).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Zero genuine violations across key pages before the flip (evidence recorded)
- Enforced in prod; smoke asserts the header; rollback = one-line header rename, documented
- No functional regression across e2e suite
**Tests:** npm run test:e2e; npm run smoke -- --base-url=http://localhost:3000
**Validation:** `npm run lint` && `npm run build` && `npm run test:e2e`
**Manual verification:** Post-deploy click-through of calculator + admin login (nonce-sensitive flows).
**Rollback/safety:** Rename header back to Report-Only; redeploy. · **Docs:** docs/production-readiness.md CSP section.
**Branch:** `ds-082-evaluate-promoting-csp-from-report-only-to-enfor` · **Commit:** `DS-082: Evaluate promoting CSP from report-only to enforced`

### DS-083 — Dependency vulnerability gate in CI

**Type:** security · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-05 · **Production approval:** no

**Problem:** No automated dependency review exists — no dependabot config, no audit step in ci.yml; supabase-js/next/fast-xml-parser advisories would arrive only via news.
**Why it matters:** fast-xml-parser parses hostile external input in this app; its advisories are directly load-bearing.
**Current behaviour:** grep: no .github/dependabot.yml; ci.yml has no audit step.
**Desired behaviour:** Dependabot (or equivalent) config for npm + github-actions ecosystems, weekly, and an `npm audit --audit-level=high` CI step that fails on high/critical prod-dependency advisories (with a documented exception mechanism).
**Evidence:** package.json dependency list · ci.yml steps (no audit)
**Likely files/subsystems:** `.github/dependabot.yml (new file)`, `.github/workflows/ci.yml`
**Out of scope:** Automerge policies.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Dependabot config present; first PRs triaged
- CI fails on injected high-severity advisory (verified with a known-vulnerable dev-only pin in a test branch, then removed)
**Validation:** `CI run on a PR`
**Manual verification:** Triage initial dependabot batch.
**Rollback/safety:** Remove config/step. · **Docs:** README contributor note.
**Branch:** `ds-083-dependency-vulnerability-gate-in-ci` · **Commit:** `DS-083: Dependency vulnerability gate in CI`

### DS-084 — Secret inventory and rotation runbook

**Type:** documentation · **Priority:** P2 (impact 3 / urgency 1 / confidence 5) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-05 · **Production approval:** no

**Problem:** Five secret surfaces exist (Vercel env, GitHub Actions secrets, Supabase service key, CRON_SECRET shared across three consumers, optional webhook URL) with no rotation procedure — rotating CRON_SECRET without a written order breaks health probes and the ingest trigger simultaneously; the handoff §M documents the Vercel empty-pull trap but not rotation.
**Why it matters:** Rotation happens under pressure (suspected leak); pressure plus no runbook equals extended outage or skipped rotation.
**Current behaviour:** No rotation doc; consumers of CRON_SECRET: Vercel env + 2 workflows + external scheduler docs.
**Desired behaviour:** docs/security-rotation-runbook.md: inventory table (secret, holders, consumers, blast radius), per-secret rotation order (create-new → update consumers → verify → retire), verification commands, and the empty-pull caveat.
**Evidence:** .env.example secret list · Workflows consuming CRON_SECRET · Handoff §M sensitive-var trap
**Likely files/subsystems:** `docs/security-rotation-runbook.md (new file)`, `README.md`
**Out of scope:** Actually rotating anything.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Every secret in .env.example + Actions has an inventory row and rotation order
- Dry-read: an operator can rotate CRON_SECRET with zero probe downtime by following it
**Validation:** `git diff --check`
**Manual verification:** Dry-read walkthrough.
**Rollback/safety:** n/a (doc). · **Docs:** This IS the doc.
**Branch:** `ds-084-secret-inventory-and-rotation-runbook` · **Commit:** `DS-084: Secret inventory and rotation runbook`

### DS-085 — Unify bearer-token verification into one timing-safe helper across all gated routes

**Type:** cleanup · **Priority:** P2 (impact 3 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-05 · **Production approval:** no

**Problem:** Five routes check `Authorization: Bearer ${CRON_SECRET}` (three crons, two health); the gift-card route documents timing-safe compare, but each route hand-rolls the check — divergence risk: one future route doing `===` on the secret undoes the discipline.
**Why it matters:** Auth checks are the definition of code that must not drift by copy-paste.
**Current behaviour:** Per-route bearer checks (verify exact duplication level at implementation); unset-secret→503 contract shared informally.
**Desired behaviour:** One lib/security/cronAuth.ts helper (timing-safe, unset→503, no logging of the presented token) consumed by all five routes; tests pin the contract once.
**Evidence:** docs/gift-card-pipeline.md gate 1 timing-safe note · 5 gated routes in app/api/
**Likely files/subsystems:** `lib/security/cronAuth.ts (new file)`, `app/api/cron/gift-card-ingest/route.ts`, `app/api/cron/monitor-feeds/route.ts`, `app/api/cron/recheck-ozbargain-expiry/route.ts`, `app/api/health/monitor/route.ts`, `app/api/health/data/route.ts`
**Out of scope:** Admin session auth (separate system).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- All five routes import the helper; grep shows zero inline secret comparisons
- Contract tests: wrong token 401/403, missing secret 503, no token echo in errors
**Tests:** tests/giftcards/giftCardIngestRoute.test.ts; tests/monitor/ route tests
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** None.
**Branch:** `ds-085-unify-bearer-token-verification-into-one-timing` · **Commit:** `DS-085: Unify bearer-token verification into one timing-safe helper across all gated routes`

## Epic L — Database and migrations (4 tickets)

*Schema, types, constraints and the publication RPC are tested and drift-proof.*

### DS-086 — Integration tests for the approve_gift_card_candidate RPC contract

**Type:** testing · **Priority:** P2 (impact 4 / urgency 2 / confidence 3) · **Effort:** L · **Risk:** medium · **Status:** needs-design
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-12 · **Production approval:** no

**Problem:** The RPC is the publication boundary (state guard → upsert → link → audit, one transaction) but is exercised only in production — no test executes the actual SQL, so a future migration editing it (as 022 did) relies on review alone.
**Why it matters:** The single most security-critical SQL in the repo has zero executable coverage; 023+ will edit it again (DS-008, DS-013).
**Current behaviour:** tests/giftcards/ covers TS layers with mocked repos; no DB-level test harness exists in the repo.
**Desired behaviour:** A test harness (Supabase branch DB or local postgres running migrations 001-022) with tests: happy approval, double-approval guard, wrong-state rejection, audit row emission, revoked-anon execution; runnable locally and optionally in CI behind secrets.
**Evidence:** 021/022 RPC definitions · No DB test harness (repo-wide)
**Likely files/subsystems:** `tests/ (new harness files)`, `package.json`
**Out of scope:** Testing every RPC (approve first; pattern reusable).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Design note: harness choice + CI posture (secretless CI stays secretless — harness must be optional)
- Five contract cases pass against migrated schema
- Documented one-command local run
**Tests:** new tests/db/ or scripts-based harness
**Validation:** `npm run lint` && `harness run command`
**Manual verification:** None.
**Rollback/safety:** Revert; test-only. · **Docs:** docs/gift-card-pipeline.md testing note.
**Branch:** `ds-086-integration-tests-for-the-approve-gift-card-cand` · **Commit:** `DS-086: Integration tests for the approve_gift_card_candidate RPC contract`

### DS-087 — Composite index for the public gift-card listing read path

**Type:** performance · **Priority:** P3 (impact 2 / urgency 1 / confidence 4) · **Effort:** XS · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Human-gated · **Iteration:** IT-17 · **Production approval:** **yes**

**Problem:** gift_card_offers has only idx_gift_card_offers_published (001); the public read filters is_published AND expiry semantics and sorts — fine at 15 rows, a seq-scan-shaped query at the hundreds-of-rows scale the pipeline is built for.
**Why it matters:** Cheap now, annoying later; indexes belong in a migration while the table is tiny.
**Current behaviour:** Single-column index (grep 001_initial_schema.sql:200).
**Desired behaviour:** Additive migration: index on (is_published, expiry_date); EXPLAIN verified against the actual listing query; manifest note.
**Evidence:** supabase/migrations/001_initial_schema.sql:200 · lib/repos/offers.ts gift-card read path
**Likely files/subsystems:** `supabase/migrations/ (new file)`, `scripts/schema-manifest.ts`
**Out of scope:** Other tables' indexes (021 already indexed staging).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- EXPLAIN shows index use for the listing query shape
- Migration additive; applied only with approval
**Tests:** tests/admin/schemaManifest.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** EXPLAIN before/after via read-only SQL.
**Rollback/safety:** drop index. · **Docs:** None.
**Branch:** `ds-087-composite-index-for-the-public-gift-card-listing` · **Commit:** `DS-087: Composite index for the public gift-card listing read path`

### DS-088 — CI drift check: regenerated database types must match the committed file

**Type:** developer-experience · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-17 · **Production approval:** no

**Problem:** database.types.ts is only correct by discipline (regenerate with every migration); prod-side changes (hotfix column, dashboard edit) would silently diverge from committed types until something breaks — the stale-types trap is #2 in the handoff traps table.
**Why it matters:** The schema-drift watchdog checks manifest-vs-prod; nothing checks types-vs-prod.
**Current behaviour:** npm run types:gen manual only; no comparison job.
**Desired behaviour:** A weekly job step (in schema-drift.yml, which already holds the needed secrets and Node 22): run types:gen to a temp file, diff against committed — differences exit 1 with the diff summary (types content is not secret).
**Evidence:** Handoff §H stale-types trap · .github/workflows/schema-drift.yml secrets/Node-22 slot · package.json types:gen (requires supabase CLI availability in the runner — verify/install step needed)
**Likely files/subsystems:** `.github/workflows/schema-drift.yml`
**Out of scope:** Auto-committing regenerated types (never).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Deliberate local mismatch turns the job red with a readable diff
- Green on current HEAD vs prod
- supabase CLI pinned/installed in the workflow
**Validation:** `Manual workflow dispatch`
**Manual verification:** One dispatch after merge.
**Rollback/safety:** Remove step. · **Docs:** None.
**Branch:** `ds-088-ci-drift-check-regenerated-database-types-must-m` · **Commit:** `DS-088: CI drift check: regenerated database types must match the committed file`

### DS-089 — DB constraint: published offers must have an expiry date or be explicitly ongoing

**Type:** migration · **Priority:** P2 (impact 3 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** medium · **Status:** blocked
**Agent:** Opus 4.8 · **Readiness:** Human-gated · **Iteration:** IT-04 · **Production approval:** **yes**

**Problem:** The expiry-or-ongoing rule lives only in approvalValidation.ts (TS layer) — direct admin edits, the RPC, and any future write path can still publish a dateless, non-ongoing row; 7 such rows exist because they predate the rule.
**Why it matters:** Data rules enforced only in one client layer regress by construction (this repo's own history proves it).
**Current behaviour:** No DB constraint; DS-008 adds the is_ongoing column the constraint needs.
**Desired behaviour:** After DS-001 cleans existing rows: check constraint (not is_published OR expiry_date is not null OR is_ongoing) as NOT VALID first, then VALIDATE once clean — staged migration with rollback notes.
**Evidence:** lib/giftcards/approvalValidation.ts:200 TS-only rule · 7 null-expiry published rows (prod 2026-07-12)
**Likely files/subsystems:** `supabase/migrations/ (new file)`, `scripts/schema-manifest.ts`
**Out of scope:** Similar constraints on other offer types (separate evaluation).
**Blocked by:** DS-008, DS-001 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Constraint validated in prod only after DS-001 sweep confirms zero violators
- Insert/update violating it fails (harness-tested if DS-086 lands, else staged-verified)
- Additive migration with NOT VALID→VALIDATE sequence documented
**Tests:** tests/admin/schemaManifest.test.ts
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** Pre-apply violator count query must return 0.
**Rollback/safety:** drop constraint. · **Docs:** docs/gift-card-pipeline.md approval section.
**Branch:** `ds-089-db-constraint-published-offers-must-have-an-expi` · **Commit:** `DS-089: DB constraint: published offers must have an expiry date or be explicitly ongoing`

## Epic M — Testing and QA (7 tickets)

*Real-shaped fixtures, DST/degraded/a11y coverage, and CI that runs everything.*

### DS-090 — Add test:giftcards and test:deals to the CI quality gate

**Type:** testing · **Priority:** P1 (impact 4 / urgency 4 / confidence 5) · **Effort:** XS · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-03 · **Production approval:** no

**Problem:** ci.yml runs test:monitor, test:stack and test:admin but NOT test:giftcards (173 tests) or test:deals (14 tests) — the newest, most-active subsystem has zero CI coverage on PRs and pushes; a second account could break the entire gift-card layer with a green check.
**Why it matters:** The exact two-account blind spot CI was built to close (PROJECT_STATE §4 CI rationale) is open again for the newest code.
**Current behaviour:** .github/workflows/ci.yml lines: three suite steps only (grep-verified).
**Desired behaviour:** Replace the per-suite steps with `npx vitest run` (all 898 tests, still fast: 1.5s locally) or add the two missing steps; CI time impact negligible.
**Evidence:** .github/workflows/ci.yml steps · Full-suite runtime 1.54s at HEAD (handoff verification)
**Likely files/subsystems:** `.github/workflows/ci.yml`
**Out of scope:** E2E/CI-time changes.
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-011

**Acceptance criteria:**
- CI runs all five Vitest suites on PRs and main pushes
- A deliberately broken giftcards test turns CI red (verified on a branch, then reverted)
**Tests:** The CI run itself
**Validation:** `CI green on the PR`
**Manual verification:** None.
**Rollback/safety:** Revert workflow line. · **Docs:** PROJECT_STATE CI paragraph (DS-011 touches it).
**Branch:** `ds-090-add-test-giftcards-and-test-deals-to-the-ci-qual` · **Commit:** `DS-090: Add test:giftcards and test:deals to the CI quality gate`

### DS-091 — Capture a sanitised real GCDB feed fixture (including a compound item)

**Type:** testing · **Priority:** P1 (impact 4 / urgency 3 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** mixed · **Readiness:** Human-gated · **Iteration:** IT-03 · **Production approval:** no

**Problem:** All parser/extractor fixtures are synthetic; the repo's own memory records that synthetic fixtures already misled once (OzBargain expiry markers existed in the real feed but not fixtures). Compound-campaign work (DS-014) needs the real shape of a multi-offer item, not a guess.
**Why it matters:** Every Epic B design decision will be validated against fixtures; wrong fixtures mean confidently wrong designs.
**Current behaviour:** tests/giftcards/parseGcdbFeed.test.ts fixtures are hand-written; one real fetch happened (2026-07-12 run) but its payload lives only in prod raw_items.
**Desired behaviour:** Extract the real feed XML shape via ONE manual fetch (or from stored raw_payload in prod, read-only) — trim to ~6 representative items incl. one compound campaign, scrub any personal data, commit as a fixture with provenance note; parser/extractor tests run against it.
**Evidence:** Memory: ozb-feed-carries-expiry-state fixture trap · 24 raw items in prod holding real payloads · docs/gift-card-pipeline.md bounded-storage rules
**Likely files/subsystems:** `tests/giftcards/ (new fixture file)`, `tests/giftcards/parseGcdbFeed.test.ts`
**Out of scope:** Recurring capture automation.
**Blocked by:** — · **Blocks:** DS-014 · **Parallel with:** DS-047

**Acceptance criteria:**
- Fixture committed with provenance comment (source, date, trimming rules)
- Stored fields only — no article bodies/images/comments (ADR-9 compliant)
- Parser + extractor tests pass against it; any behavioural surprise becomes its own ticket
**Tests:** tests/giftcards/parseGcdbFeed.test.ts; tests/giftcards/extractOffer.test.ts
**Validation:** `npx vitest run tests/giftcards`
**Manual verification:** The one-time capture (manual GET or read-only prod raw_payload export) needs a human decision on which items to include.
**Rollback/safety:** Remove fixture. · **Docs:** Fixture provenance header.
**Branch:** `ds-091-capture-a-sanitised-real-gcdb-feed-fixture-inclu` · **Commit:** `DS-091: Capture a sanitised real GCDB feed fixture (including a compound item)`

### DS-092 — Production-shaped fixture builders and visual screenshot harness

**Type:** testing · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-11 · **Production approval:** no

**Problem:** The 33-brand layout blowout was invisible with tidy fixtures; 'ugly but real' shapes (500-char brand strings, null dates, 0%-discount points rows, near-expiry, stale-checked) exist in prod but not as reusable test data, and there is no screenshot pass to eyeball them.
**Why it matters:** Every UI ticket in this backlog (I epic, G epic) needs prod-shaped data to be validated honestly; the shapes should be frozen into builders before the knowledge fades.
**Current behaviour:** tests/giftcards/offerFixture.ts exists (single shape); Playwright configured but no screenshot flow.
**Desired behaviour:** Builder module exporting the documented ugly shapes; a script that boots next start with DATA_SOURCE=static extended by those rows and captures screenshots of /gift-cards, one detail page, /deals, homepage for manual diff.
**Evidence:** tests/giftcards/offerFixture.ts · docs/RECOMMENDED-AUTOMATIONS.md #5 · view-model refactor origin story (commit 1d7b87a)
**Likely files/subsystems:** `tests/giftcards/offerFixture.ts`, `scripts/visual-check.ts (new file)`, `package.json`
**Out of scope:** Pixel-diff assertions (possible follow-up).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Builders cover ≥6 documented production hazard shapes with comments citing the real row that motivated each
- One command produces the screenshot set locally
- Static fallback data path renders the builders without code forks
**Tests:** tests/giftcards/offerCardViewModel.test.ts consumes the builders
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Eyeball the first screenshot set.
**Rollback/safety:** Revert. · **Docs:** Script usage note in package.json/README.
**Branch:** `ds-092-production-shaped-fixture-builders-and-visual-sc` · **Commit:** `DS-092: Production-shaped fixture builders and visual screenshot harness`

### DS-093 — DST-boundary tests for the Sydney run-hour schedule guard

**Type:** testing · **Priority:** P2 (impact 3 / urgency 2 / confidence 5) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-03 · **Production approval:** no

**Problem:** schedule.ts is pure-Intl DST-safe by design and the workflow fires at both UTC equivalents, but no test pins behaviour ON the transition days (first Sunday in October / first Sunday in April) — the exact dates where 20:00 vs 21:00 UTC flips and a 2am-skipped-hour could double-accept or double-skip.
**Why it matters:** DST bugs surface twice a year in production and never in development; a fixed-date test costs nothing forever.
**Current behaviour:** tests/giftcards/schedule.test.ts covers ordinary days (per handoff); transition-day cases absent.
**Desired behaviour:** Table-driven cases for 2026-10-04 and 2027-04-04 transitions: both UTC trigger times, ±1h, asserting exactly one acceptance window per Sydney day and correct 40h-guard interaction across the shift.
**Evidence:** lib/giftcards/schedule.ts Intl implementation · .github/workflows/gift-card-ingest.yml dual-cron rationale
**Likely files/subsystems:** `tests/giftcards/schedule.test.ts`
**Out of scope:** Changing the schedule.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Transition-day cases pass; a deliberately broken fixed-offset implementation fails them (verified by temporary mutation)
- 40h guard cases span the transition
**Tests:** tests/giftcards/schedule.test.ts
**Validation:** `npx vitest run tests/giftcards`
**Manual verification:** None.
**Rollback/safety:** n/a (test-only). · **Docs:** None.
**Branch:** `ds-093-dst-boundary-tests-for-the-sydney-run-hour-sched` · **Commit:** `DS-093: DST-boundary tests for the Sydney run-hour schedule guard`

### DS-094 — Automated axe accessibility checks in the Playwright suite

**Type:** accessibility · **Priority:** P2 (impact 3 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-10 · **Production approval:** no

**Problem:** No automated accessibility checking exists (no axe dependency, grep-verified); a11y regressions land invisibly and manual audits (DS-066) decay without a machine backstop.
**Why it matters:** The e2e harness already visits every key page; wiring axe into it converts each visit into an a11y gate nearly for free.
**Current behaviour:** tests/e2e/public-flows.spec.ts covers flows; no a11y assertions.
**Desired behaviour:** @axe-core/playwright added; critical+serious violations fail the suite on homepage, /deals, /gift-cards, one detail page, /search; documented allowlist mechanism for triaged false positives.
**Evidence:** No axe in package.json · playwright.config.ts two-project setup
**Likely files/subsystems:** `tests/e2e/public-flows.spec.ts`, `package.json`
**Out of scope:** Fixing found issues beyond triage (DS-066 handles fixes).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Suite fails on an injected critical violation (verified on a branch)
- Current pages pass or have documented, ticketed exemptions
- Runs in CI within the existing e2e step
**Tests:** tests/e2e/public-flows.spec.ts additions
**Validation:** `npm run build` && `npm run test:e2e`
**Manual verification:** Triage the first violation report.
**Rollback/safety:** Remove dependency + assertions. · **Docs:** None.
**Branch:** `ds-094-automated-axe-accessibility-checks-in-the-playwr` · **Commit:** `DS-094: Automated axe accessibility checks in the Playwright suite`

### DS-095 — Degraded-state e2e: configured-but-unreachable Supabase serves honest empties, never demo data

**Type:** testing · **Priority:** P1 (impact 4 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-11 · **Production approval:** no

**Problem:** The fail-closed contract (configured DB + error ⇒ empty, never static fallback) is central to public trust (ADR-15) but e2e only exercises the static path (no Supabase env) — the exact dangerous state (env SET, backend down) has no automated coverage.
**Why it matters:** This is the state a Supabase outage puts production in; 'we believe it fails closed' should be 'the suite proves it'.
**Current behaviour:** playwright webServer runs DATA_SOURCE=static; no test points NEXT_PUBLIC_SUPABASE_URL at an unreachable host.
**Desired behaviour:** A Playwright project (or targeted spec) booting with Supabase env set to an unreachable address: homepage, /gift-cards, /deals, /stores render honest empty/degraded states with zero demo/'Illustrative' content (reusing strict-smoke matchers).
**Evidence:** ADR-15 / fromDbOrStatic deletion (05cc339) · scripts/smoke-routes.ts --strict-content matchers · playwright.config.ts webServer block
**Likely files/subsystems:** `tests/e2e/ (new spec file)`, `playwright.config.ts`
**Out of scope:** Partial-failure (one table down) simulation.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Suite fails if any demo-marker string renders in degraded mode
- Pages return 200 with explanatory empties (not 500s)
- Runs locally; CI inclusion decided by runtime cost
**Tests:** tests/e2e/ new degraded spec
**Validation:** `npm run build` && `npm run test:e2e`
**Manual verification:** None.
**Rollback/safety:** Remove spec. · **Docs:** None.
**Branch:** `ds-095-degraded-state-e2e-configured-but-unreachable-su` · **Commit:** `DS-095: Degraded-state e2e: configured-but-unreachable Supabase serves honest empties, never demo data`

### DS-096 — Property-based tests for the valuation formulas

**Type:** testing · **Priority:** P3 (impact 3 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-03 · **Production approval:** no

**Problem:** value.ts formulas (bonus 10/(100+10), points cents-per-point, effective saving) are example-tested only; boundary behaviour (0%, 100%+, fractional cents, huge multipliers) relies on reviewer arithmetic.
**Why it matters:** These numbers are the product; a property suite (monotonicity, bounds, never-negative, cash/points separation) catches the whole class of formula slips, including future mechanics (DS-015/016).
**Current behaviour:** tests/giftcards/value.test.ts example-based.
**Desired behaviour:** Property-style tests (fast-check or hand-rolled generators): effective saving ∈ [0,100); bonus formula monotonic in bonus%; points estimate scales linearly with cents-per-point; no formula output NaN/negative for valid inputs.
**Evidence:** lib/giftcards/value.ts · Cashback cap-maths 10x bug precedent (c6e31ed)
**Likely files/subsystems:** `tests/giftcards/value.test.ts`, `package.json (fast-check dev-dep, optional)`
**Out of scope:** Stack-level invariants (DS-061).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-061

**Acceptance criteria:**
- Properties pass 1000+ generated cases; seeded/reproducible failures
- A deliberately introduced off-by-100 fails (verified by mutation)
**Tests:** tests/giftcards/value.test.ts
**Validation:** `npx vitest run tests/giftcards`
**Manual verification:** None.
**Rollback/safety:** n/a. · **Docs:** None.
**Branch:** `ds-096-property-based-tests-for-the-valuation-formulas` · **Commit:** `DS-096: Property-based tests for the valuation formulas`

## Epic N — Developer experience (6 tickets)

*The rituals that keep this repo safe are one-command mechanical, not tribal.*

### DS-097 — One-command full validation gate (validate:all)

**Type:** developer-experience · **Priority:** P2 (impact 4 / urgency 2 / confidence 5) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-03 · **Production approval:** no

**Problem:** The full pre-commit gate is nine commands across two Node concerns (handoff §L); partial runs have produced 'green-but-not-really' claims, and the giftcards/deals CI gap (DS-090) shows what unenforced discipline costs.
**Why it matters:** Run before every commit by every agent; the summary table doubles as the honest completion report the working-style rules demand.
**Current behaviour:** Commands documented in handoff §L only; no orchestration.
**Desired behaviour:** npm run validate:all: node-version check → lint → tsc --noEmit → vitest run → build → git diff --check, with per-step pass/fail summary and first-failure abort; --with-e2e flag adds the Playwright suite.
**Evidence:** docs/OPUS-4.8-HANDOFF.md §L · docs/RECOMMENDED-AUTOMATIONS.md #1
**Likely files/subsystems:** `scripts/validate-all.ts (new file)`, `package.json`, `README.md`
**Out of scope:** CI changes (DS-090).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-098

**Acceptance criteria:**
- Single command runs the gate and prints a summary table; non-zero exit on any failure
- Refuses to run on Node <20 with a clear message
- Documented in README + handoff §L
**Tests:** The command run on HEAD (all green)
**Validation:** `npm run validate:all`
**Manual verification:** None.
**Rollback/safety:** Remove script. · **Docs:** README, handoff §L.
**Branch:** `ds-097-one-command-full-validation-gate-validate-all` · **Commit:** `DS-097: One-command full validation gate (validate:all)`

### DS-098 — Fail-fast Node-version preflight for all npm scripts

**Type:** developer-experience · **Priority:** P2 (impact 3 / urgency 2 / confidence 5) · **Effort:** XS · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-03 · **Production approval:** no

**Problem:** The shell defaults to Node 15; engines>=20 exists in package.json but npm doesn't enforce it by default, so wrong-Node runs fail with misleading errors (Turbopack panics, supabase-js WebSocket crashes) that have repeatedly consumed debugging time.
**Why it matters:** Cheapest fix in the backlog for a documented recurring trap (three separate memory entries touch it).
**Current behaviour:** engines field only; .nvmrc exists for CI; no runtime check.
**Desired behaviour:** engine-strict via .npmrc (or a preinstall/pretest check script) so any script on Node <20 fails immediately with 'run nvm use 20'; seed script additionally asserts Node ≥22 with its own message.
**Evidence:** package.json engines field · Memory: node-version-setup + preview-server gotchas · schema-drift.yml Node-22 rationale comment
**Likely files/subsystems:** `.npmrc (new file)`, `package.json`, `scripts/seed.ts`
**Out of scope:** Auto-switching Node.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- npm run lint under Node 15 fails instantly with the instructive message
- npm run seed under Node 20 names the Node-22 requirement
- No behaviour change on correct versions
**Tests:** Manual version-switch verification
**Validation:** `npm run lint (Node 20)` && `npm run build`
**Manual verification:** Try one script under wrong Node.
**Rollback/safety:** Remove .npmrc line/check. · **Docs:** README setup section.
**Branch:** `ds-098-fail-fast-node-version-preflight-for-all-npm-scr` · **Commit:** `DS-098: Fail-fast Node-version preflight for all npm scripts`

### DS-099 — Migration-rollout checklist automation (review → approve → apply → probe → types → manifest → hash)

**Type:** developer-experience · **Priority:** P2 (impact 4 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** medium · **Status:** ready
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-03 · **Production approval:** no

**Problem:** The migration ritual that kept 021/022 safe (apply → information_schema probe → types:gen → tsc → manifest → offer-hash before/after → one commit) is tribal knowledge in the handoff; migration 005 went missing historically precisely because steps of this ritual were skipped, and this backlog schedules at least four more migrations (DS-008, DS-013, DS-036, DS-089).
**Why it matters:** Highest-blast-radius recurring workflow; four known future executions.
**Current behaviour:** Handoff §K Phase 2-3 prose + docs/RECOMMENDED-AUTOMATIONS.md #2 proposal.
**Desired behaviour:** A checklist skill or script that walks the ritual with hard stops: user approval gate before apply, automated probe/hash/types/manifest steps, refuses on dirty git; produces the evidence block for the commit message.
**Evidence:** Migration 005 drift incident · 021/022 rollout records (b541521, 05d6d00) · docs/RECOMMENDED-AUTOMATIONS.md #2
**Likely files/subsystems:** `scripts/migration-rollout.ts (new file)`, `package.json`
**Out of scope:** Auto-applying anything.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Dry-run mode works with zero prod access
- Apply step unreachable without typed user confirmation
- Produces before/after offers-hash and probe output as a pasteable evidence block
**Tests:** Pure steps unit-tested where practical
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** First real use on DS-008.
**Rollback/safety:** Tool itself read-only until the gated apply step. · **Docs:** docs/gift-card-pipeline.md ops; handoff §K reference.
**Branch:** `ds-099-migration-rollout-checklist-automation-review-ap` · **Commit:** `DS-099: Migration-rollout checklist automation (review → approve → apply → probe → types → manifest → hash)`

### DS-100 — Read-only production offer-audit script producing a corrections-doc draft

**Type:** developer-experience · **Priority:** P2 (impact 4 / urgency 2 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-19 · **Production approval:** no

**Problem:** The 2026-07-10 card-offer audit and 2026-07-12 gift-card audit were hand-built SELECT+diff exercises; the defect taxonomy is now stable (missing expiry, stale checked, sample prose, mis-typed mechanic, root citations, near-expiry, duplicates) and will recur every review cycle.
**Why it matters:** Mechanical detection + human judgement is the correction workflow; the detection half should never be hand-built again.
**Current behaviour:** docs/gift-card-offer-corrections-2026-07-12.md was manually authored; DS-009 covers dashboard flags but not the reviewable document output.
**Desired behaviour:** npm run audit:offers -- --type=giftcards|cards|all: read-only SELECT via service key, applies the defect taxonomy (reusing duplicateDetection + readiness/staleness helpers), emits docs/offer-audit-<date>.md in the corrections-doc table format.
**Evidence:** docs/gift-card-offer-corrections-2026-07-12.md format · lib/giftcards/duplicateDetection.ts / lib/offers/cardReadiness.ts reusable checks · docs/RECOMMENDED-AUTOMATIONS.md #3
**Likely files/subsystems:** `scripts/audit-offers.ts (new file)`, `package.json`
**Out of scope:** Applying corrections (always human, DS-001 etc.).
**Blocked by:** — · **Blocks:** — · **Parallel with:** DS-009

**Acceptance criteria:**
- Run against prod reproduces the known §J findings (validation against ground truth)
- Strictly read-only (no write client constructed)
- Output document matches the established format including the needs-legend
**Tests:** Unit tests for the classification against fixture rows
**Validation:** `npm run lint` && `npx vitest run`
**Manual verification:** Compare first output against the hand-written corrections doc.
**Rollback/safety:** n/a (read-only). · **Docs:** README script table.
**Branch:** `ds-100-read-only-production-offer-audit-script-producin` · **Commit:** `DS-100: Read-only production offer-audit script producing a corrections-doc draft`

### DS-101 — Post-merge verification script (strict smoke + health probes + doc-refresh reminder)

**Type:** developer-experience · **Priority:** P3 (impact 3 / urgency 1 / confidence 4) · **Effort:** S · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-19 · **Production approval:** no

**Problem:** After-push verification (strict smoke against prod, bearer health probes, 'did you update PROJECT_STATE?') is manual and demonstrably skipped — PROJECT_STATE went stale precisely this way.
**Why it matters:** Cheap, high-signal, and the manual version's skip-rate is proven.
**Current behaviour:** Individual commands exist (smoke, curl probes); no chain, no reminder.
**Desired behaviour:** npm run verify:deploy -- --base-url=<prod>: strict-content smoke + both health endpoints (CRON_SECRET from env) + a checklist echo of docs to refresh when subsystem state changed.
**Evidence:** docs/RECOMMENDED-AUTOMATIONS.md #6 · scripts/smoke-routes.ts --strict-content · PROJECT_STATE staleness incident (DS-011)
**Likely files/subsystems:** `scripts/verify-deploy.ts (new file)`, `package.json`
**Out of scope:** Auto-updating docs.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- One command, clear pass/fail summary, non-zero exit on any probe failure
- No secrets printed; health checks skipped with a warning when CRON_SECRET unset
**Tests:** Dry-run against local build
**Validation:** `npm run lint` && `npm run build`
**Manual verification:** One run against prod after merge.
**Rollback/safety:** Remove script. · **Docs:** README.
**Branch:** `ds-101-post-merge-verification-script-strict-smoke-heal` · **Commit:** `DS-101: Post-merge verification script (strict smoke + health probes + doc-refresh reminder)`

### DS-102 — Doc-freshness ritual: state-file update step in the /phase skill and commit checklist

**Type:** documentation · **Priority:** P3 (impact 2 / urgency 1 / confidence 4) · **Effort:** XS · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-02 · **Production approval:** no

**Problem:** PROJECT_STATE.md and gift-card-pipeline.md went stale because nothing in the working ritual forces the 'update state docs' step after subsystem-changing work; DS-011 fixes the instances, not the cause.
**Why it matters:** The next handoff inherits whatever drift this doesn't prevent.
**Current behaviour:** /phase skill (c6daf99) runs scope→implement→verify→commit; no doc-refresh step. CLAUDE.md commit checklist likewise.
**Desired behaviour:** The /phase skill definition and the commit checklist gain an explicit final step: 'if subsystem state changed, update PROJECT_STATE.md / relevant pipeline doc in the same commit' with a two-line decision rule.
**Evidence:** DS-011 stale instances · .claude /phase skill existence (PROJECT_STATE §4 tooling)
**Likely files/subsystems:** `.claude/skills/ (phase skill file)`, `CLAUDE.md`
**Out of scope:** Automated doc generation.
**Blocked by:** DS-011 · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Skill text and CLAUDE.md checklist updated
- Next three phase commits demonstrably include or explicitly waive the step
**Validation:** `git diff --check`
**Manual verification:** None.
**Rollback/safety:** Revert. · **Docs:** This IS the doc change.
**Branch:** `ds-102-doc-freshness-ritual-state-file-update-step-in-t` · **Commit:** `DS-102: Doc-freshness ritual: state-file update step in the /phase skill and commit checklist`

## Epic O — Product growth and future capability (6 tickets)

*Evidence-backed growth, sequenced strictly after trust and correctness.*

### DS-103 — Public 'report a problem' on gift-card offers (reusing the correction-report pattern)

**Type:** feature · **Priority:** P2 (impact 3 / urgency 1 / confidence 4) · **Effort:** M · **Risk:** low · **Status:** ready
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-19 · **Production approval:** **yes**

**Problem:** Card offers have a public correction-report flow (ReportOfferForm + card_offer_correction_reports + dedicated rate-limit table + admin queue); gift-card offers — with MORE data-quality exposure (13 rows, 7 undated) — offer users no way to flag a dead promo.
**Why it matters:** Users are the cheapest verification workforce; the pattern is already built, reviewed, and rate-limited for cards.
**Current behaviour:** components/ReportOfferForm.tsx used only by app/cards/[id]/page.tsx (grep-verified); card_offer_correction_reports/correction_report_rate_limits tables exist.
**Desired behaviour:** Detail pages gain the report form; reports land in a gift-card correction queue (new table mirroring 012, or a generalised one per design call), reviewed in admin like card reports; same rate limiting.
**Evidence:** Grep: ReportOfferForm single usage · supabase/migrations/012_card_offer_correction_reports.sql pattern · app/admin/(protected)/card-reports/ queue precedent
**Likely files/subsystems:** `app/gift-cards/[id]/page.tsx`, `components/ReportOfferForm.tsx`, `supabase/migrations/ (new file)`, `app/admin/(protected)/card-reports/page.tsx`
**Out of scope:** Acceptance-evidence contributions (below).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Reports submit with rate-limit + spam bounds identical to card reports
- Admin queue lists gift-card reports with the offer context
- No PII collected beyond the existing pattern
**Tests:** tests/admin/ report action tests; npm run test:admin
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Submit one local report end-to-end.
**Rollback/safety:** Additive migration rollback; feature revert. · **Docs:** None.
**Branch:** `ds-103-public-report-a-problem-on-gift-card-offers-reus` · **Commit:** `DS-103: Public 'report a problem' on gift-card offers (reusing the correction-report pattern)`

### DS-104 — Research: next Australian gift-card/deal sources with compliant feeds

**Type:** research · **Priority:** P3 (impact 3 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** low · **Status:** future
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-20 · **Production approval:** no

**Problem:** GCDB is a single point of editorial failure for gift-card intelligence; source expansion is an explicit goal but no candidate list with feed/robots evaluations exists beyond the card-offer decisions in migration 017.
**Why it matters:** The adapter work (DS-048) is only worth building against a real, vetted second source.
**Current behaviour:** docs/source-expansion-strategy.md covers earlier decisions; no gift-card-specific source evaluation.
**Desired behaviour:** Evaluation memo per candidate source (feed availability, licence/ToS, robots, content quality, overlap with GCDB): recommend register-disabled or reject, migration-017-style; explicitly NO fetching code.
**Evidence:** supabase/migrations/017_card_source_registry.sql decision-record precedent · docs/source-expansion-strategy.md
**Likely files/subsystems:** `docs/source-expansion-strategy.md`
**Out of scope:** Implementation (DS-048 + future tickets).
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- ≥3 candidates evaluated with cited evidence
- Each verdict recorded durably (doc + optionally a disabled source row proposal)
**Manual verification:** Manual feed discovery/robots reading only.
**Rollback/safety:** n/a. · **Docs:** docs/source-expansion-strategy.md addendum.
**Branch:** `ds-104-research-next-australian-gift-card-deal-sources` · **Commit:** `DS-104: Research: next Australian gift-card/deal sources with compliant feeds`

### DS-105 — Expiring-offer alerts for users (design-first, requires accounts decision)

**Type:** feature · **Priority:** P3 (impact 3 / urgency 1 / confidence 2) · **Effort:** XL · **Risk:** high · **Status:** future
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-20 · **Production approval:** **yes**

**Problem:** Time-boxed offers (the site's core content) expire without users knowing; there is no notification capability and — more fundamentally — no user accounts, so 'alert me' has no anchor.
**Why it matters:** Highest-requested class of deal-site feature, but it drags in accounts, email infra, and privacy obligations — none of which exist today.
**Current behaviour:** No auth for public users (admin-only auth); no email infrastructure.
**Desired behaviour:** A design spike FIRST: anonymous (email-only, double-opt-in) vs account-based; privacy/compliance posture; infra cost on Hobby plan. Implementation only after the spike is approved. Recommended decomposition: (1) design spike + user decision, (2) subscription storage + double-opt-in, (3) daily digest job within cron limits, (4) unsubscribe/compliance.
**Evidence:** Product goal (user request); no supporting infra in repo (verified absence)
**Likely files/subsystems:** `docs/ (new design doc)`
**Out of scope:** Any code.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Spike document with recommendation and cost/compliance analysis; user decision recorded
- No implementation in this ticket
**Manual verification:** n/a.
**Rollback/safety:** n/a (design). · **Docs:** New design doc under docs/.
**Recommended decomposition (XL):** Design spike + decision → Subscription storage + opt-in → Digest job within one-cron-per-day limits → Compliance/unsubscribe
**Branch:** `ds-105-expiring-offer-alerts-for-users-design-first-req` · **Commit:** `DS-105: Expiring-offer alerts for users (design-first, requires accounts decision)`

### DS-106 — Public read-only JSON export of published offers

**Type:** feature · **Priority:** P3 (impact 2 / urgency 1 / confidence 3) · **Effort:** M · **Risk:** medium · **Status:** future
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-20 · **Production approval:** **yes**

**Problem:** Published offer data is only consumable as HTML; researchers/aggregators (and our own future clients) would use a stable JSON surface — but an unthrottled public API on a Hobby plan invites scraping-by-proxy costs.
**Why it matters:** Cheap goodwill + dogfooding surface, IF bounded; premature otherwise.
**Current behaviour:** app/api/card-offers/ exists as a precedent public JSON route (verify its caching/limits at implementation).
**Desired behaviour:** Design-first: cached (revalidate-bound) read-only endpoints for published offers with attribution requirements and rate limiting; explicitly published fields only (view-model-derived, no raw columns).
**Evidence:** app/api/card-offers/route precedent · Vercel Hobby constraints (handoff)
**Likely files/subsystems:** `app/api/ (new route files)`
**Out of scope:** Write APIs; API keys.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Design note approved; endpoints serve view-model-shaped published data with cache headers
- Attribution/licence text decided and served alongside
**Tests:** Route tests
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Load-test the cached path lightly.
**Rollback/safety:** Remove routes. · **Docs:** README API section (new).
**Branch:** `ds-106-public-read-only-json-export-of-published-offers` · **Commit:** `DS-106: Public read-only JSON export of published offers`

### DS-107 — Affiliate-disclosure support in editorial policy and offer surfaces

**Type:** feature · **Priority:** P3 (impact 2 / urgency 1 / confidence 3) · **Effort:** S · **Risk:** low · **Status:** future
**Agent:** Codex · **Readiness:** Codex-ready · **Iteration:** IT-20 · **Production approval:** **yes**

**Problem:** If any outbound offer link ever becomes an affiliate link, Australian consumer-law disclosure expectations apply; today there is no disclosure slot in the UI or policy text, so the first affiliate deal would ship non-compliant by default.
**Why it matters:** Pre-building the disclosure slot keeps a future revenue decision from being a compliance scramble; policy pages already exist to anchor it.
**Current behaviour:** app/editorial-policy/page.tsx exists with no affiliate section; no affiliate links exist today (verified absence of tracking params in offer URLs is part of this ticket).
**Desired behaviour:** Editorial policy gains an affiliate-disclosure section (drafted for user approval); offer link components support an optional per-offer disclosure badge, dormant until a link is actually affiliate.
**Evidence:** app/editorial-policy/page.tsx · lib/security/urlPolicy.ts outbound-link chokepoints
**Likely files/subsystems:** `app/editorial-policy/page.tsx`, `components/GiftCardOfferCard.tsx`
**Out of scope:** Actually joining affiliate programmes.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Policy section drafted and approved; badge renders only when an offer is flagged affiliate
- Verification recorded that current outbound URLs carry no affiliate params
**Tests:** Component render tests
**Validation:** `npm run lint` && `npx vitest run` && `npm run build`
**Manual verification:** Policy wording sign-off by the user.
**Rollback/safety:** Revert. · **Docs:** Editorial policy page (is the change).
**Branch:** `ds-107-affiliate-disclosure-support-in-editorial-policy` · **Commit:** `DS-107: Affiliate-disclosure support in editorial policy and offer surfaces`

### DS-108 — Offer-quality scoring for ranking (design-first, after trust foundations)

**Type:** research · **Priority:** P3 (impact 2 / urgency 1 / confidence 2) · **Effort:** M · **Risk:** low · **Status:** future
**Agent:** Opus 4.8 · **Readiness:** Opus-design · **Iteration:** IT-20 · **Production approval:** no

**Problem:** The 'recommended' sort on /gift-cards has no documented quality model; as offer volume grows (recurring ingestion + more sources), ranking by effective saving alone will surface high-value-but-stale or low-confidence offers above fresh confirmed ones.
**Why it matters:** Ranking IS an editorial claim; it should be a documented formula, not an accident of sort order — but it only matters at volume, so this is deliberately last.
**Current behaviour:** lib/giftcards/publicQuery.ts 'recommended' sort implementation (read it as the first step); confidence/staleness/value fields all exist as inputs.
**Desired behaviour:** A design note: scoring inputs (effective saving, confidence, freshness, expiry proximity, evidence completeness), the formula, tie-breaks, and how the score is explained to users (transparency requirement); implementation ticket cut only after approval.
**Evidence:** lib/giftcards/publicQuery.ts sorts · Trust-first ordering requirement (user instruction: growth must not outrank trust)
**Likely files/subsystems:** `docs/ (new design note)`
**Out of scope:** Implementation; personalisation.
**Blocked by:** — · **Blocks:** — · **Parallel with:** any non-conflicting ticket

**Acceptance criteria:**
- Design note with worked examples on current prod rows; user approval before any implementation ticket is created
**Manual verification:** n/a.
**Rollback/safety:** n/a. · **Docs:** Design note under docs/.
**Branch:** `ds-108-offer-quality-scoring-for-ranking-design-first-a` · **Commit:** `DS-108: Offer-quality scoring for ranking (design-first, after trust foundations)`
