# PLAN-top-deals-approved-signal-boundary - Make homepage signals obey approval

> **Status: Shipped in the 2026-07-10 production-readiness audit.**
> The full Node 20 quality gate is green; the staging state-matrix check remains
> a manual pre-launch acceptance step.
>
> **Rank: 1 of 5. Do this first.** Verified against `main` at `f65c951`.
> The queue UI says importing creates a pending signal that is not public until
> approval, but `lib/repos/topDeals.ts` publishes the linked raw `feed_items` row
> as soon as `review_state = 'imported'`. The same query requires
> `feed_sources.is_enabled = true`, so the emergency stop shipped in `f65c951`
> can remove reviewed homepage content even though its confirmation promises
> that public data is unchanged. Both behaviours cross the intended boundary
> between ingestion state, moderation state, and publication state.

## Goal

The homepage Top 5 must show only an imported feed item whose linked
`ozbargain_signals` row is currently `status = 'approved'`, is not a sample, and
is not hard-expired. Render the approved signal's edited title, summary, tags,
source URL, and dates, never the raw feed copy. Feed-source enablement remains an
operational fetch switch only: disabling every feed must not unpublish already
approved content.

No migration, RLS change, monitor fetch change, or auto-publication is allowed.

## Exact Files To Touch

| File | Required change |
|---|---|
| `lib/repos/topDeals.ts` | Join each imported feed item to its promoted signal, require approved/non-sample/live signal state, map approved copy, and remove the feed-source enabled filter |
| `tests/monitor/topDeals.test.ts` | Pin the two-step publication contract, approved-copy mapping, expiry/sample guards, and source-disable independence |
| `app/admin/(protected)/signals/actions.ts` | Revalidate `/` whenever signal content or status changes |
| `app/admin/(protected)/signals/queue/actions.ts` | Keep mutation comments aligned with the two-step publication contract |
| `app/admin/(protected)/signals/queue/QueueClient.tsx` | Clarify Top 5 tooltips: visibility is preselected here, but publication still requires signal approval |
| `docs/ozbargain-monitoring.md` | Document ingestion review versus signal moderation versus homepage visibility |
| `FINAL-LAUNCH-CHECKLIST.md` | Add a pending/approved/hidden regression check for homepage signals |
| `PROJECT_STATE.md` | Record the corrected publication boundary and current commit sequence |

Do **not** edit applied migration `005_feed_item_homepage_hidden.sql`; its old
comment is historical migration context. Document the current contract in code
and the runbook instead.

## Implementation Order

1. In `lib/repos/topDeals.ts`, replace the `feed_sources!inner(is_enabled)`
   relationship with an inner relationship through
   `feed_items.promoted_signal_id`:

   ```ts
   signal:ozbargain_signals!inner(
     id, source_native_id, title, summary, source_url, posted_at,
     expiry_date, tags, is_sample, status, last_checked_at
   )
   ```

   Keep the feed-item fields needed for curation and recency: `id`,
   `source_native_id`, `fetched_at`, `review_state`, and
   `hidden_from_homepage`.

2. Keep `.eq("review_state", "imported")` and
   `.eq("hidden_from_homepage", false)`. Add embedded filters for
   `signal.status = approved` and `signal.is_sample = false`. Do not query or
   filter `feed_sources.is_enabled` at all.

3. Defensively filter mapped rows in JavaScript as well. Export a small pure
   helper such as `topDealCandidateToRankable(row, today)` that returns `null`
   unless all of these are true:

   - feed item is `imported`;
   - promoted signal exists and is `approved`;
   - signal is not a sample;
   - `isPastExpiry(signal.expiry_date, today)` is false.

   Use `todayAU()` and `isPastExpiry()` from `lib/offers/expiry.ts`; an offer
   remains visible through its AU-local expiry day.

4. Build the ranking input from the **signal** fields:

   - `id`: approved signal id;
   - `title`, `summary`, `link`, `postedAt`, `categories`: signal title,
     summary, source URL, posted date, and tags;
   - `nativeId`: signal native id, falling back to the feed item's native id;
   - `fetchedAt`: feed item timestamp, retained only for deterministic recency
     fallback and the section's last-updated display.

   Never fall back to `raw_title`, `raw_summary`, or `feed_items.link` after a
   linked signal exists. Those values are unedited ingestion evidence.

5. Update the module comments and exported publication constants. Keep
   `PUBLIC_REVIEW_STATES = ["imported"]` and add/pin an approved signal status
   constant if that makes the contract explicit. The service-role read remains
   necessary because `feed_items.hidden_from_homepage` is private; only the
   small `TopDeal` DTO may leave this module.

6. In `app/admin/(protected)/signals/actions.ts`, add `revalidatePath("/")` to
   `revalidateSignals()`. Both edit-form saves and list status changes use that
   helper. Keep `/deals` and `/admin/signals` revalidation. Do not revalidate the
   homepage from the import action merely because a row became pending; it
   cannot be public yet.

7. Update the queue tooltips. "Show in Top 5" means "eligible after import and
   approval"; "Hide from Top 5" remains an independent curation veto. Do not
   remove pre-approval hide/show controls: an admin may decide visibility while
   triaging, before approving the linked signal.

8. Add tests before changing docs:

   - imported + pending -> excluded;
   - imported + approved + non-sample + live -> included;
   - imported + hidden -> excluded;
   - imported + approved but expired -> excluded;
   - imported + approved sample -> excluded;
   - `new` feed item linked to approved signal -> excluded;
   - mapping uses edited signal title/summary/URL/tags, even when raw feed fields
     contain different text;
   - eligibility has no `is_enabled` input, proving source disablement cannot
     affect publication;
   - existing ranking tests remain unchanged and green.

9. Update the monitoring runbook and launch checklist with a manual state
   matrix: import pending (absent), approve (present unless hidden), hide signal
   or expire it (absent), disable all feed sources (still present).

10. Run the full Node 20 gate:

    ```bash
    npm run lint
    npm run test:monitor
    npm run test:stack
    npm run test:admin
    npm run build
    git diff --check
    ```

## Edge Cases A Weaker Model Would Miss

1. **Imported is ingestion state, not publication state.** Import deliberately
   creates a `pending` signal. Treating `feed_items.review_state='imported'` as
   sufficient makes the queue's two-step safety copy false.
2. **Render approved copy, not merely gate raw copy with approval.** The admin
   edits/paraphrases the signal before approval. Showing `raw_summary` after
   approval bypasses that editorial work and can expose feed HTML or wording the
   admin intentionally replaced.
3. **The emergency stop must not be a content kill switch.**
   `feed_sources.is_enabled` controls future network selection in
   `listDueEnabledFeeds`; it must not control already approved public rows.
4. **A hidden feed item remains hidden after approval.** The independent
   `hidden_from_homepage` veto still applies even though content now comes from
   the joined signal.
5. **Status changes in either direction matter.** Approved -> hidden/expired
   must remove the card after revalidation, and pending -> approved must add it.
   Updating only the list-page status action but not edit-form saves leaves one
   stale path; both flow through `revalidateSignals()`.
6. **Hard expiry is a read-time guard.** Cleanup is operational hygiene, not a
   prerequisite for correctness. An approved signal whose expiry passed must
   disappear even if cleanup has not run.
7. **PostgREST embedded filtering needs `!inner`.** Filtering an optional embed
   without an inner join can leave parent feed rows with `signal: null`; keep a
   defensive JavaScript guard regardless.
8. **Do not expose staging tables through anon RLS.** The server-only
   service-role projection is intentional. Adding public `feed_items` policies
   to simplify the query would broaden access to raw ingestion data.
9. **Do not delete or rewrite migration 005.** Production may already have it in
   migration history. Correct current documentation outside the applied SQL.
10. **Signal source URL is authoritative after approval.** An admin may replace
    a malformed or redirected feed link. The public card must follow the saved
    signal URL.

## Acceptance Criteria

- [ ] Importing a queue item creates/links a pending signal and does not make it
      appear in "Today's top OzBargain signals".
- [ ] Approving that linked signal makes its edited content eligible after `/`
      revalidation; hiding/expiring it removes it.
- [ ] An approved but `hidden_from_homepage=true` item remains absent.
- [ ] An approved signal on its AU expiry day remains visible; it is absent the
      next AU calendar day.
- [ ] Running "Disable all feed sources" changes feed-source enabled counts but
      does not change the already approved Top 5 output.
- [ ] Public response data contains approved signal copy only; raw feed title and
      summary are not rendered.
- [ ] No RLS, migration, cron route, or `vercel.json` change is present.
- [ ] Full Node 20 quality gate and `git diff --check` pass.
