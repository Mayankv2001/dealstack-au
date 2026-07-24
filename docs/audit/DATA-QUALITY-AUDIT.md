# Data-Quality Audit — expiry, freshness, gift-card accuracy

> Audit date: 2026-07-19 · HEAD `9b7365f` · Read-only. Production row-level data was NOT re-queried in this session; row-level claims below cite the 2026-07-12 prod snapshot recorded in `docs/OPUS-4.8-HANDOFF.md` §J and remain the authority of DS-001…DS-007.

## Expiry model (verified consistent)

One convention everywhere inspected, centralised in `lib/offers/expiry.ts`:

- "Expired" = `expiry_date < todayAU()` as **string comparison of Sydney calendar dates** — no Date parsing, no UTC off-by-one at AU midnight. Offers remain live ON their expiry day. Null expiry = evergreen for legacy offer types; for gift cards, null expiry is honestly **"missing"**, never "ongoing" (`lib/giftcards/dateState.ts`).
- Read-time enforcement on every public path checked: `lib/repos/offers.ts` (filterLive at lines ~201/332/432/476/547), `lib/repos/topDeals.ts:98`, `lib/repos/sourceResults.ts:397-399`, `lib/giftcards/currentOffers.ts:64`, `lib/giftcards/publicQuery.ts:239`. Public display therefore does not depend on the archival cron having run.
- Write-side archival: daily pipeline `archiveExpiredDeals` (RPC, `lib/admin/repos/dailyPipeline.ts:60`) + `scripts/cleanup-old-deals.ts` dry-run tool; gift-card side `applyGiftCardLifecycle` (activate/archive/history-seal) with cache revalidation even on zero-transition retries (`app/api/cron/gift-card-lifecycle/route.ts` comment).
- "Expiring soon" (7 days) and stale-data (21 days) warnings are AU-calendar-correct (`isExpiringSoonAU`, `staleDataWarning`).

## Freshness model

- Public: `lib/freshness.ts` — checked-today / this-week / needs-recheck / not-yet-checked (7-day window). "Not yet checked" is displayed honestly.
- Stack engine: separate 21-day `STALE_DATA_DAYS` boundary (`lib/stack/compatibility.ts:26`).
- Monitor: 30h staleness (`lib/monitor/staleness.ts`), NaN-safe.

## Findings

### DQ-F1 — Never-checked layers escape the stack's stale warning *(Design weakness → TASK-EXP-001)*
`staleDataWarning(lastCheckedAt=null) → null` (`lib/stack/compatibility.ts:~137`). A layer with no verification timestamp gets **no** warning, while one checked 22 days ago is flagged — inverted incentive. The public freshness label ("Not yet checked") covers listing surfaces but stack recommendation cards rely on the warnings array.

### DQ-F2 — Known published-row defects from the 2026-07-12 snapshot *(Confirmed then; re-verify before acting)*
Null-expiry published rows, the mis-typed 0%-discount legacy rows, sample prose, stale `last_checked_at` — all fully ticketed as DS-001…DS-007/DS-010. **Not duplicated here.** Note the gift-card data-health dashboard checks (DS-009) and the DB constraint "published ⇒ expiry or explicit ongoing" (DS-089) remain the durable fixes.

### DQ-F3 — Reconciliation coverage is now implemented but unproven in production *(Missing verification)*
`runReconcile` + `loadReconcileInputs` handle source-removed, expired (fanned into one lifecycle transaction), predictions and acceptance outcomes — with taxonomy tests. But every gift-card job is default-off and (per 2026-07-13 evidence) the Actions secret was missing, so **none of this has demonstrably run on schedule in production**. → TASK-CRON-003 gates any claim of "stale data is prevented".

### DQ-F4 — Migration 033 approval-hardening not applied *(Human-gated)*
Until 033 is applied, the approve RPC lacks the advisory-lock serialisation and single-field-update restriction it was designed to add; the legacy-offer pre-review (10 rows) is an explicit prerequisite. → TASK-GC-001, TASK-DB-001.

**Resolved 2026-07-21:** 033 is applied — the advisory-lock serialisation and hardened single-lineage update path are live in production (034–037 applied since; `verify:schema` 37/37). **Still open:** the 10-row legacy pre-review (TASK-GC-001) was NOT done first, so the confirmed-only RLS now hides two legacy `needs-verification` offers instead of deleting them (ledger doc, 033–035 side-effect note).

### DQ-F5 — Predicted vs confirmed separation *(Verified good)*
Prediction capture/review is admin-only (`components/admin/Prediction*.tsx`, `/admin/gift-cards/predictions`); public surfaces found rendering predictions: only `/gift-cards/history` (occurrence history, clearly historical). No public surface inspected presents a prediction as a current confirmed offer.

### DQ-F6 — Search-index/staleness *(Verified good within design)*
There is no separate search index to go stale: search queries the same expiry-filtered pools at request time (`lib/repos/sourceResults.ts` final filter pass), and `deriveConfidence` downgrades past-expiry results so the UI "never shows confirmed past expiry" (`lib/sources/searchSources.ts` comment + implementation).

## Data-quality invariants worth test-pinning (feeds VALIDATION-MATRIX)

1. No public repo path returns a row with `expiry_date < todayAU()` (already covered per-repo; a shared property test would pin the convention).
2. `giftCardDateState(null expiry, !isOngoing) === "missing"` — never "ongoing" (covered in tests/giftcards).
3. Stack `verifiedSaving ≤ totalSaving`; points value never subtracted from cash price (`buildStack.ts` notes; TASK-TEST-003 property-tests these).
