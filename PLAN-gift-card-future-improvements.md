# DealStack AU gift-card future improvement plan

## Goal

Move the gift-card system from a corrected, human-reviewed catalogue to a
durable accuracy platform without weakening the current trust gates. Production
data changes, migration applies, and recurring ingestion remain separate,
explicit approval points.

## Guiding rules

- Source evidence and seller identity stay separate.
- A source campaign is never published as one offer when it contains different
  mechanics, thresholds, eligibility rules, or expiry states.
- Missing expiry never means ongoing; ongoing must be stated by the source.
- Points are not cash and must always identify their programme.
- No scheduled ingestion is enabled until the manual workflow has completed two
  clean dry runs and the user explicitly approves activation.
- Every production mutation must be row-reviewed and audit logged.

## Phase 1 — Correct production truth

### Objective

Resolve the current 13-row audit before adding more catalogue depth.

### Files and systems

- `docs/gift-card-offer-corrections-2026-07-12.md`
- `app/admin/(protected)/gift-cards/review/actions.ts`
- `lib/giftcards/approvalValidation.ts`
- Production `gift_card_offers` only after explicit row approval

### Implementation order

1. Review every proposed update, archive, split, and unpublish row in the
   correction document.
2. Approve the four active-offer date/term corrections individually.
3. Correct dates on the four expired rows, then archive them.
4. Unpublish the four unsupported legacy sample rows.
5. Leave the broad Amazon row unchanged until replacement children have passed
   review; replace it atomically so users never see a duplicate campaign.
6. Re-query all published rows and save a post-correction audit snapshot.

### Acceptance criteria

- Every published row has a seller, offer-level HTTPS source, brand, atomic
  mechanic/value, and expiry or explicit ongoing state.
- No expired or sample row remains publicly visible.
- Published offer count matches the approved correction list exactly.
- Ingestion remains disabled.

## Phase 2 — Apply and validate the accuracy model

### Objective

Enforce the application safeguards at database level.

### Files

- `supabase/migrations/023_gift_card_accuracy_model.sql`
- `scripts/schema-manifest.ts`
- `lib/supabase/database.types.ts`
- `tests/admin/migrationContracts.test.ts`
- `tests/giftcards/approvalValidation.test.ts`

### Implementation order

1. Test migration 023 against a production-schema clone.
2. Run a preflight query listing every row that would violate the new checks.
3. Stop if the query returns any unreviewed row.
4. Obtain explicit migration approval.
5. Apply migration 023 in a maintenance window.
6. Regenerate Supabase types from the migrated schema; do not hand-edit them.
7. Validate the constraint after the corrected dataset has zero violations.
8. Exercise the approval RPC with missing source, mixed mechanic, missing date,
   missing points programme, and removed-child cases.

### Acceptance criteria

- Migration applies cleanly to a clone and production.
- Generated types match the live schema.
- Invalid candidates fail in both application validation and the RPC.
- Existing public reads and admin review remain green.

## Phase 3 — Complete compound-campaign support

### Objective

Represent Amazon-style campaigns as stable, atomic child offers.

### Files

- `lib/giftcards/extractOffer.ts`
- `lib/giftcards/runIngest.ts`
- `lib/admin/repos/giftCardPipeline.ts`
- `components/admin/GiftCardReviewCard.tsx`
- `lib/giftcards/duplicateDetection.ts`
- `tests/giftcards/extractOffer.test.ts`
- `tests/giftcards/runIngest.test.ts`

### Implementation order

1. Define stable child keys from source product/mechanic identity, never dates
   or values.
2. Add a reviewed source adapter that emits one candidate per child mechanic.
3. Show parent/child lineage, source removal, targeting, and expiry independently
   in the admin queue.
4. Add an atomic replacement operation: publish reviewed children and unpublish
   the broad parent in one audited transaction.
5. Add idempotency tests for reorder, value change, child removal, and child
   reappearance.
6. Split Amazon only after official child terms are attached.

### Edge cases

- Some children expire before their parent campaign page.
- Targeted Prime variants must not be merged with generally available offers.
- A source falling out of a bounded feed window is not evidence of removal.
- Product bundles sharing one mechanic can remain one offer; different
  mechanics or thresholds cannot.

### Acceptance criteria

- No published row spans multiple mechanics or thresholds.
- Re-ingesting the same campaign creates no duplicate child.
- Removed children require review and never auto-unpublish public data.
- Amazon’s broad parent is absent once its reviewed children are live.

## Phase 4 — Launch programme/catalogue rates

### Objective

Model Macquarie, RACV, and NRMA as changing catalogues rather than temporary
promotions.

### Files

- `supabase/migrations/024_gift_card_programmes.sql`
- `lib/giftcards/programmeRates.ts`
- `tests/giftcards/programmeRates.test.ts`
- New admin programme/rate pages under `app/admin/(protected)/gift-cards/`
- Public programme presentation under `app/gift-cards/`

### Implementation order

1. Approve the programme schema and test migration 024 on a clone.
2. Build admin CRUD with provider, membership/account/payment requirements,
   source, checked date, and review-by date.
3. Record immutable added/removed/increased/decreased rate history.
4. Enter Macquarie rates from reviewed evidence; do not seed a broad “up to”
   offer.
5. Add RACV/NRMA only after authenticated catalogue evidence is reviewed.
6. Publish only current, confirmed rates whose review deadline has not passed.

### Acceptance criteria

- Programme rates never appear in the short-term offer table.
- Each published rate has product-specific evidence and a finite review date.
- Stale rates disappear from public queries without losing audit history.
- Membership/account/payment requirements are visible before stack guidance.

## Phase 5 — Operational hardening before automation

### Objective

Make ingestion observable and safely reversible while keeping it disabled.

### Files

- `lib/giftcards/runIngest.ts`
- `app/api/cron/gift-card-ingest/route.ts`
- Admin monitoring pages under `app/admin/(protected)/monitor/`
- `tests/giftcards/giftCardIngestRoute.test.ts`
- `tests/monitor/`

### Implementation order

1. Add dry-run summaries for new, changed, compound, removed, and rejected items.
2. Add automatic pause thresholds for parser failures and unexpected volume.
3. Add alerts for stale sources, approval backlog age, missing dates, and offers
   expiring within 48 hours.
4. Document an emergency stop and rollback procedure.
5. Run two manually triggered dry runs and review every output row.
6. Request separate explicit approval before enabling any schedule.

### Acceptance criteria

- Dry runs cannot publish or unpublish offers.
- A source anomaly pauses processing without deleting candidates.
- Monitoring identifies stale and expiring data before public inaccuracy.
- `enabled` and `automated_fetch_allowed` remain false until the final approval.

## Phase 6 — Public trust and usability improvements

### Objective

Help users understand value and restrictions without overstating certainty.

### Files

- `app/gift-cards/page.tsx`
- `app/gift-cards/[id]/page.tsx`
- `components/GiftCardOfferCard.tsx`
- `lib/giftcards/compatibility.ts`
- `lib/giftcards/stackability.ts`
- `tests/e2e/public-flows.spec.ts`

### Implementation order

1. Add accessible structured data and verify that it matches visible facts.
2. Add comparison for atomic offers without comparing points directly to cash.
3. Show “last checked” and evidence strength consistently on list/detail pages.
4. Add automated accessibility checks for cards, tabs, filters, drawers, and
   trust badges.
5. Add degraded-data tests for missing optional terms and unavailable logos.

### Acceptance criteria

- Detail and stack surfaces never disagree about compatibility.
- Points offers always retain the “points are not cash” disclosure.
- Desktop and 390px mobile layouts have no horizontal overflow.
- Keyboard navigation, focus order, labels, and contrast pass automated and
  manual review.

## Required validation for every implementation phase

Run under Node 20:

```bash
npm run lint
npx tsc --noEmit
npm run test:giftcards
npm run test:stack
npm run test:admin
npm run test:monitor
npm run build
npm run test:e2e
git diff --check
```

## Recommended next action

Do Phase 1 first: explicitly review the correction table row by row. It removes
current public inaccuracies and is the prerequisite for safely applying the
database constraint. If production review must wait, the safest code-only task
is Phase 3’s idempotency and atomic-replacement test coverage; do not split the
live Amazon row yet.
Act as the programme manager and senior reviewer for the Gift Card End-to-End Automation programme.

You have already completed repository discovery and created:

* PLAN-gift-card-end-to-end-automation.md
* tasks/gift-card-automation/TASK-00-INDEX.md
* The associated TASK files

Now execute Wave 0 only:

* TASK-01 — source-policy and permission audit
* TASK-02 — author migrations 028, 029 and 030 as SQL files only
* TASK-16a — DST, scheduling and idempotency test scaffolding using existing modules

Non-negotiable restrictions

1. Do not apply any migration.
2. Do not connect to or modify production data.
3. Do not deploy.
4. Do not commit or push.
5. Do not enable any ingestion source, feature flag, cron gate or workflow.
6. Do not start Wave 1 or any later task.
7. Do not fabricate source permissions, robots findings, legal approval or production evidence.
8. Preserve the existing admin-approval boundary.
9. Predictions must remain isolated from live offers.
10. Acceptance data must remain reviewed structured data, not hard-coded production lists.

Execution model

Run TASK-01, TASK-02 and TASK-16a in parallel where their files do not overlap.

Before assigning work:

1. Read the programme plan.
2. Read TASK-00-INDEX.md.
3. Read each Wave 0 task file in full.
4. Inspect the exact existing files each task may modify.
5. Record the initial git status.

Each worker must:

* Follow only its assigned task.
* Avoid unrelated refactors.
* Reuse existing repository patterns.
* Add or update tests where required.
* Report every changed file.
* Report commands run and their exact results.
* Stop without committing or pushing.

Required manager review

After all workers finish, become the senior engineering manager and review the combined work yourself.

Do not trust worker completion claims. Inspect every diff and verify:

TASK-01

* Every relevant source is recorded.
* Permission, terms and robots evidence is factual and timestamped where available.
* Unknown permission is explicitly marked unknown.
* No unsupported claim is made that scraping is permitted.
* Disabled/admin-assisted operation is clearly documented for sources without confirmed permission.
* Registry gaps for the Point Hacks predictions page and GCDB merchant data are addressed or clearly documented.

TASK-02

Review migrations 028–030 for:

* Correct numbering and dependencies after migrations 023–027.
* No duplicate or overlapping tables.
* Safe foreign keys, indexes, constraints and defaults.
* Appropriate enums or check constraints.
* RLS default-deny where required.
* Prediction data isolation from approved/live offer queries.
* Acceptance fields covering channel, evidence tier, source, freshness, review status and reconciliation.
* Run-kind support without weakening existing locking or idempotency.
* Reversible or operationally safe migration design.
* No migration was applied.

Run static SQL checks available in the repository. Compare generated types only if the task explicitly requires it; do not regenerate unrelated types.

TASK-16a

Verify tests cover at least:

* Australia/Sydney 07:00 scheduling.
* Standard-time and daylight-saving UTC mappings.
* Both sides of DST transitions.
* Duplicate execution protection.
* The 48-hour guard.
* Lock/idempotency behaviour.
* Default-off gates.
* No new candidate bypasses admin approval.
* Activation affects only already-approved, future-dated offers.
* Predictions cannot enter live-offer paths.

Tests must use existing schedule and ingestion modules rather than duplicating production logic inside fixtures.

Validation

Run the smallest relevant tests during worker execution, then run the complete repository quality gate appropriate for these changes, including:

* Lint
* TypeScript/typecheck
* Relevant gift-card, ingestion, schedule and migration tests
* The full Vitest suite if practical
* Production build if the changed files can affect compilation or routes

Do not conceal pre-existing failures. Clearly distinguish:

* New failures caused by Wave 0
* Pre-existing failures
* Environmental limitations

Completion rules

A task may be marked complete only when:

* Its acceptance criteria are satisfied.
* Its diff has been personally reviewed by the manager.
* Relevant tests pass.
* No restriction was violated.
* Documentation matches the implementation.

When something is incomplete or incorrect, fix it directly and repeat the review. Do not merely describe what remains.

Final response

Provide:

1. Executive completion status for each Wave 0 task.
2. Manager-review findings and any corrections you made.
3. Exact files created or modified.
4. Exact validation commands and results.
5. Migration design summary for 028–030.
6. Source-policy findings, clearly separating confirmed, prohibited, unclear and pending-human-approval sources.
7. Remaining blockers before Wave 1.
8. Final git status.
9. Explicit confirmation that nothing was committed, pushed, deployed, migrated or changed in production.
10. A recommendation of either:

* WAVE 0 APPROVED — READY FOR HUMAN MIGRATION DESIGN REVIEW, or
* WAVE 0 NOT APPROVED, with the exact unresolved issues.

Do not ask to begin Wave 1. Stop after the Wave 0 manager review.