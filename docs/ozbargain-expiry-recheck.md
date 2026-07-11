# OzBargain source-recheck (expiry + deletion detection)

A **separate, production-safe** scheduled job that revalidates **pending** OzBargain
review items (`feed_items.review_state = 'new'`) and archives the ones whose source is
**explicitly expired or gone**. It is independent of the ingestion cron
(`/api/cron/monitor-feeds`) and of the published-signal validator.

- **Route:** `GET /api/cron/recheck-ozbargain-expiry`
- **Off by default:** `OZB_EXPIRY_RECHECK_ENABLED=false`
- **Preview by default:** `OZB_EXPIRY_RECHECK_DRY_RUN=true` (writes nothing)
- **Never** hard-deletes, publishes, imports, or auto-applies anything.

## What this job detects, and how

Two signals, both riding existing approved request shapes (no HTML retrieval, no
new request shape — see the owner-review addendum "structured `ozb` feed fields
captured" in `docs/ozbargain-monitoring.md`):

- ✅ **Expired** — OzBargain publishes deal state **inside its own RSS feeds**
  (manually verified 2026-07-11 against the compliance-approved tag feed): an explicit
  `<ozb:title-msg type="expired">` marker (covers "expired" and "out of stock") and a
  structured `<ozb:meta expiry="…">` declared-expiry timestamp. The ingestion parser
  captures both into `feed_items.source_marked_expired` / `declared_expires_at`; the
  recheck job archives from those STORED facts with **zero extra outbound requests** —
  as `source_expired` when the marker is set, or when the declared expiry passed more
  than `DECLARED_EXPIRY_ARCHIVE_MARGIN_HOURS` (24h) ago.
- ✅ **Deleted** — the OzBargain post returns HTTP **404/410** to the status-only HEAD
  probe. Archived as `source_deleted`.

**Honest coverage limits.** A status-only HEAD cannot see expiry (an expired post is
still HTTP 200), and repository policy correctly forbids fetching/parsing the post's
HTML page (`CLAUDE.md`: "RSS/Atom feed parsing only — no HTML scraping";
`docs/ozbargain-monitoring.md` "not allowed" list; the compliance addendum scopes the
per-post probe to "HEAD only … no content retrieval"). Consequently the expiry signal
comes only from feed data: items ingested **before** these columns existed, and items
that aged out of the feed window without ever carrying a marker or declared expiry,
hold no stored facts — for those, only deletion detection applies until they are
re-seen in a feed. Feed *absence* is deliberately never treated as expiry (the window
is tiny), and expiry is never inferred from a HEAD response.

## Why a second job

A staged item can sit in review for days; meanwhile its source post may be **deleted**.
This job periodically re-probes and moves confirmed-deleted items out of active review
(archive), preserving the row and a full audit trail. Everything ambiguous or merely
failing stays in Review.

## Architecture

```
cron (external scheduler / Vercel) ──► GET /api/cron/recheck-ozbargain-expiry
  auth (CRON_SECRET, timing-safe) ─► enabled? ─► compliance approved? ─► UA set?
        │
        ▼
  runRecheckExpiry (lib/monitor/runRecheckExpiry.ts)  ── pure, dependency-injected
        │   startRun (one-running lock, migration 020)
        │   listCandidates ── pending posts, never-checked/oldest-checked first
        │   stored?   ── classifyStoredSourceState (feed facts on the row; NO request)
        │   classify  ── classifySourcePost (HEAD only, reuses validateSourcePost)
        │   decide    ── decideRecheckOutcome (pure; recheckExpiry.ts)
        │   dryRun? ── count only, write nothing
        │   else ── archive (explicit expired/deleted) | stamp
        ▼   finishRun (metrics)
  ozb_recheck_runs (run ledger)   +   audit_log (per archival + system events)
```

All network access goes through the **existing** `validateSourcePost` HEAD primitive and
the **existing** `lib/security/urlPolicy` allow-list + redirect validation; the expiry
facts ride the **existing** approved feed fetch (parser: `lib/monitor/parseFeed.ts`).
No new fetch path, no HTML scraping, no page-body retrieval.

## Classification rules (exact)

**Step 1 — stored feed facts** (`classifyStoredSourceState`, no request):

| Stored on the row (captured at ingest from the approved feed)      | Classification | Archives? |
| ------------------------------------------------------------------ | -------------- | --------- |
| `source_marked_expired = true` (`<ozb:title-msg type="expired">`)  | `expired`      | **yes → `source_expired`** (signal `feed-expired-marker`) |
| `declared_expires_at` ≥ 24h in the past (`<ozb:meta expiry>`)      | `expired`      | **yes → `source_expired`** (signal `feed-declared-expiry-passed`) |
| `declared_expires_at` in the future or < 24h past / no facts       | —              | fall through to step 2 |

**Step 2 — status-only HEAD** (`classifySourcePost`) to the approved
`https://(www.)ozbargain.com.au/node/<id>` URL, only when step 1 is inconclusive:

| Observed                                              | Classification | Archives? |
| ----------------------------------------------------- | -------------- | --------- |
| HTTP 2xx                                              | `active`       | no (stays in Review) |
| HTTP **404 / 410**                                    | `deleted`      | **yes → `source_deleted`** |
| HTTP 403 / other 4xx / anti-bot / off-boundary redirect | `unknown`    | no (stays in Review) |
| HTTP 429 / 5xx / timeout / DNS / network failure      | `fetch_failed` | no (stays in Review) |
| non-OzBargain / unsafe URL (out of scope)             | `unknown`      | no (skipped) |

The HEAD probe itself never produces `expired` — expiry comes exclusively from the
structured feed facts in step 1.

## Archive rules (exact)

`decideRecheckOutcome(item, status, now)` yields exactly one action:

- `deleted` → **archive** `source_deleted` (immediate; 404/410 is permanent).
- `expired` → **archive** `source_expired` (from stored feed facts: the explicit
  marker immediately, a passed declared expiry only after the 24h margin — the margin
  absorbs poster extensions, which a re-seen feed item refreshes, plus clock skew).
- `active` → **reset** the failure streak, set `last_validated_at = now`.
- `unknown` / `fetch_failed` → **record-failure**: keep the item in Review, bump
  `consecutive_validation_failures` (an observability signal only). **Never archives** —
  there is no "unavailable after N failures" path. Timeouts, 429, 5xx, 403, anti-bot,
  network/DNS failures all keep the item in Review indefinitely.

Archival (`archive_recheck_feed_item` RPC, `security definer`, service-role only):
guards on `review_state = 'new'`; transitions `review_state → 'archived'`; sets
`archived_at`, `archive_reason` (constrained to the two explicit reasons), `source_status`,
`source_expired_at`, `last_source_check_at`; writes an `audit_log` row
(`auto-archive-recheck`) in the same transaction with the item id, safe source identifier,
prior status, new status, archive reason, run id, and checked-at. Archived rows are **not**
in the retention purge set, so History and Audit retain them indefinitely.

## Preview / dry-run mode

`OZB_EXPIRY_RECHECK_DRY_RUN` defaults to **true** (any value other than exactly `false` is
preview). In preview the job:

- fetches (HEAD) and classifies due items;
- records run metrics, including **would_archive**;
- writes **no** `feed_items` changes and **no** archival audit entries;
- marks the run `dry_run = true` (shown as "preview" on `/admin/monitor`).

`would_archive` in a preview run tells you exactly how many items a live run *would*
archive. Rollout **must** preview first.

## Request limits & politeness

- **HEAD only**, no body download, no page parsing, no secondary requests
  (no assets/scripts/images).
- **5s** hard timeout per request; **≤2** redirects, validated to stay on the approved
  post boundary.
- **Bounded concurrency of 4**; batch size **25–50** items/run
  (`OZB_EXPIRY_RECHECK_BATCH_SIZE`, default 40).
- Per-item **min interval** (`OZB_EXPIRY_RECHECK_MIN_INTERVAL_HOURS`, default 20h) so an
  item is not re-probed too often; ordering is never-checked then oldest-checked first.
- Requires the identifying `OZB_MONITOR_USER_AGENT` and an approved compliance review
  before any outbound request. Response bodies are never fetched, stored, or logged.

## Configuration

| Var | Default | Meaning |
| --- | --- | --- |
| `OZB_EXPIRY_RECHECK_ENABLED` | `false` | Master switch. Off = zero DB/network work. |
| `OZB_EXPIRY_RECHECK_DRY_RUN` | `true` | Preview (write nothing). Set `false` to go live. |
| `OZB_EXPIRY_RECHECK_BATCH_SIZE` | `40` | Items per run (clamped 25–50). |
| `OZB_EXPIRY_RECHECK_MIN_INTERVAL_HOURS` | `20` | Min hours between re-probes of one item. |

## Scheduling

The project is on the **Vercel Hobby plan: one cron per day maximum**, and `CLAUDE.md`
forbids sub-daily `vercel.json` schedules — so `vercel.json` is **unchanged**. Drive the
recheck at a conservative 6–12h cadence with the same external scheduler (e.g.
cron-job.org) already used for ingestion:

```
GET https://<host>/api/cron/recheck-ozbargain-expiry
Authorization: Bearer ${CRON_SECRET}
```

The one-running lock and per-item min-interval make extra calls cheap. When off Hobby,
add a coarser Vercel cron entry:

```jsonc
{ "path": "/api/cron/recheck-ozbargain-expiry", "schedule": "0 12 * * *" }
```

## Rollout (preview-first, required)

1. Owner reviews and signs off the compliance addendum ("structured `ozb` feed
   fields captured", `docs/ozbargain-monitoring.md`). The job stays disabled
   until then.
2. Apply migration `020_ozb_expiry_recheck.sql` to production (reviewed).
3. Deploy the code (job stays disabled; dry-run stays true).
4. Run the read-only estimate queries below.
5. Set `OZB_EXPIRY_RECHECK_ENABLED=true` **with `OZB_EXPIRY_RECHECK_DRY_RUN=true`** and
   point the external scheduler at the route. Watch `/admin/monitor` → "Recent
   expiry-recheck runs": confirm the runs are marked **preview**, `would_archive` looks
   sane, and `active` is the large majority.
6. Only after the preview numbers look right, set `OZB_EXPIRY_RECHECK_DRY_RUN=false` to
   begin archiving confirmed-expired/deleted items. Re-check the monitor after the first
   live run.

## Rollback

- Immediate stop: set `OZB_EXPIRY_RECHECK_ENABLED=false` **or**
  `OZB_EXPIRY_RECHECK_DRY_RUN=true` (returns to no-write preview), or stop the external
  scheduler. Env changes take effect on the next deploy for the Vercel path.
- Un-archive a wrongly archived item (never deleted): `update feed_items set
  review_state='new', archived_at=null, archive_reason=null, source_status=null,
  consecutive_validation_failures=0, failure_streak_started_at=null where id='<id>'`.

## Read-only estimate queries (run before enabling)

```sql
-- Pending OzBargain posts in scope for the recheck.
select count(*) as pending_in_scope
from feed_items
where review_state = 'new'
  and link like '%ozbargain.com.au/node/%';

-- Distribution of the last recorded source_status (null = never checked yet).
select coalesce(source_status, 'never-checked') as source_status, count(*)
from feed_items
where review_state = 'new'
group by 1 order by 2 desc;

-- Items last classified deleted but still pending (would archive on the next LIVE run).
select count(*) as would_archive_deleted
from feed_items
where review_state = 'new' and source_status = 'deleted';

-- Items whose STORED feed facts would archive them as expired on the next LIVE run.
-- (Rows ingested before migration 020 hold no facts until re-seen in a feed, so this
-- starts at 0 and grows as ingestion runs refresh the ledger.)
select count(*) as would_archive_expired
from feed_items
where review_state = 'new'
  and (source_marked_expired
       or declared_expires_at < now() - interval '24 hours');
```

There is deliberately no "unavailable after N failures" query — nothing archives on
that path under current policy.

## Summary

This job archives pending review items on **two explicit source signals only**:
**expiry**, read from structured fields OzBargain publishes in its own RSS feeds
(explicit expired marker; declared expiry passed by ≥ 24h) and consumed from the
row with zero extra requests — and **deletion**, a confirmed HTTP 404/410 from the
status-only HEAD probe. It never parses HTML, never adds a request shape beyond the
approved feed fetch + per-post HEAD, and everything ambiguous or transiently failing
stays in active Review indefinitely. Coverage note: items with no stored feed facts
(ingested pre-020 and never re-seen) can only be caught by deletion until a feed
refresh stamps them.
