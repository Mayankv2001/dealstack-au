# Runbook — Expired offer shown as current

The most trust-damaging incident class: a user follows an offer that has ended. The system is engineered so this *shouldn't* happen — use this runbook to find which defence failed.

## The defence layers (know before diagnosing)
1. **Read-time filtering (primary):** every public repo path drops rows with `expiry_date < todayAU()` — Sydney calendar-date string comparison, offers live ON their expiry day (`lib/offers/expiry.ts`; enforcement in `lib/repos/offers.ts`, `topDeals.ts`, `sourceResults.ts`, `lib/giftcards/currentOffers.ts`, `publicQuery.ts`). This works even if every cron is dead.
2. **Write-time archival (secondary):** daily pipeline `archiveExpiredDeals` + gift-card lifecycle activate/archive.
3. **Cache:** ISR 300s on the big pages; lifecycle revalidates affected paths on transitions.
4. **Search confidence:** `deriveConfidence` downgrades past-expiry results so search never labels them confirmed.

## Symptoms
User report / operator observation of an ended offer rendering as live, or an expired offer appearing in search or the carousel.

## Safe checks (read-only, in order)
1. **Pin the row:** which offer, which page, exact timestamp (Sydney). Screenshot it.
2. **What does the DB say?** Read the row (read-only): `expiry_date`, status, published flags. Three very different incidents follow:
   - **(A) `expiry_date` in the past but rendering:** filtering bug or cache. Check whether a hard refresh after 5+ min (ISR window) still shows it. If yes ⇒ code-path bug: identify which repo path serves that page and reproduce locally with a fixture — this is a P0 code defect; file it immediately with the reproduction.
   - **(B) `expiry_date` null:** not a filtering bug — the row has *unknown* expiry. Legacy types render as evergreen by convention; gift cards render "missing" honestly. If the offer factually ended, this is a data-quality incident (the DS-001/DS-089 class): the fix is admin correction of the row + the constraint work, not the read path.
   - **(C) `expiry_date` in the future but the offer factually ended early:** source truth moved before our data. Reconciliation/re-verification gap — expected occasionally by design (daily cadence); admin-correct the row, and check the source's last reconcile outcome.
3. **Was it the permalink presentation?** Expired `/deals/[slug]` permalinks intentionally render for inbound links. If the complaint is really "the expired page doesn't look expired enough", that's `tasks/expiry/TASK-EXP-002`, not an incident.

## Recovery
- Case A: file the P0 with reproduction; if severe, an admin can unpublish/correct the row via admin surfaces to stop the bleeding while the fix lands.
- Case B/C: admin corrects/expires the row through the normal admin flow (audited). Public read paths drop it immediately; ISR clears within 5 minutes (or trigger revalidation via a lifecycle run if urgent).
- Tell the user/reporter what happened honestly if the report came from outside.

## Requires approval
- Unpublishing anything beyond the single offending row.
- Any bulk expiry correction (DS-054 tooling territory).

## Never casually
- Direct SQL against production offers (admin surfaces/RPCs only — audit trail).
- "Fixing" by deleting rows — archive/expire, never hard-delete; history feeds reconciliation and the public history page.

## Validation after recovery
Offer absent from all public surfaces + search; row state correct; if Case A, regression test written before the incident is closed.

## Escalation
Owner: (fill in). For Case A also open a task file under `tasks/expiry/` with the reproduction.
