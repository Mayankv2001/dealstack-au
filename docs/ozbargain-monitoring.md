# OzBargain Monitoring — Planning & Compliance

> **⚠️ Automated fetching only runs behind the compliance gate.**
>
> Compliance is approved on file (see [decision log](#compliance-decision-log)),
> so the Phase 1 fetcher and a **secret-gated cron route** now exist — but they
> stay **off by default**: the master switch `OZB_MONITOR_ENABLED` defaults off,
> every `feed_sources` row starts disabled, and the cron route additionally
> re-checks the compliance gate at request time. With any one of those off, no
> outbound request is made and OzBargain data stays 100% manual (admin-entered)
> with the static sample fallback serving. The invariants are non-negotiable:
> feed-only (no scraping/crawling/anti-bot bypass), no user-triggered fetches,
> writes only to the staging tables (never `ozbargain_signals`), and **admin
> approval stays mandatory**.
>
> **Current workflow update (migration 015, 2026-07-11):** the historical
> planning sections below describe the original two-step import design. The
> implemented daily pipeline now runs once at **00:00 UTC**, archives expired
> rows, performs status-only validation of approved OzBargain post URLs, fetches
> due feeds, and records fetched/new/updated/skipped/error counts. New feed rows
> land directly in `/admin/signals/queue`; **Approve** is the single human
> publication step and **Reject** archives without deletion. Fetch code itself
> still writes staging tables only and never invokes approval.

---

## Goal

Give DealStack a **safe, low-volume, human-reviewed** way to surface relevant
OzBargain community deal signals for the merchants we already track — without
scraping, without evading any protection, and without ever coupling user traffic
to outbound requests.

Concretely:

- Pull a **small allowlist of permitted feeds** on a slow schedule.
- Stage raw items in their own tables, **separate** from the public data.
- Let an admin **review, paraphrase, and approve** each item before it appears
  publicly as an `ozbargain_signals` row.
- Keep the public site fully functional whether the monitor is on, off, or
  broken (approved signals + static fallback already guarantee this).

This is an **assistive ingestion pipeline**, not an autonomous agent.

---

## Compliance rules

**Gate:** none of the build steps past "compliance pre-flight" may start until
every box here is checked and the decision is recorded in this document.

- [ ] Review OzBargain's current `robots.txt` and confirm the exact feed paths
      we intend to use are **not disallowed**.
- [ ] Review OzBargain's Terms of Service / acceptable-use / any published feed
      or API policy; confirm low-volume personal/syndication feed use is allowed.
- [ ] Record the decision (date, reviewer, links, allowed feed URLs) in the
      [Compliance decision log](#compliance-decision-log) below.
- [ ] Choose a descriptive `User-Agent` string that identifies DealStack and
      includes a contact URL.
- [ ] Confirm a documented/derived **rate ceiling** and set the schedule well
      under it.
- [ ] Re-review if OzBargain's terms or `robots.txt` change.

If any box cannot be checked, **the monitor is not built** and we stay manual.

### What is allowed

- Fetching a **small, explicit allowlist** of public RSS/Atom feeds, **if** the
  compliance review permits it.
- **Conditional GETs** (`ETag` / `If-Modified-Since`) so unchanged feeds cost
  nothing.
- A **slow, fixed schedule** (hours, not minutes), server-side only.
- Storing **structured feed fields + our own short paraphrase** (title, link,
  posted date, categories) for admin review.
- A descriptive `User-Agent` with a contact URL.
- Honouring `Retry-After` and backing off on errors.

### What is **not** allowed

- ❌ Scraping the OzBargain website or any HTML page (only structured feeds).
- ❌ Crawling the whole site / following links to fetch more pages.
- ❌ Bypassing or "solving" Cloudflare, login walls, CAPTCHAs, or any anti-bot
  system. A challenge/HTML/non-200 response = **blocked → stop & disable**.
- ❌ Ignoring `robots.txt`, rate limits, or `Retry-After`.
- ❌ **User-triggered live fetches** (see rule below).
- ❌ Copying full post content — we keep links and our **own paraphrase** only.
- ❌ Auto-publishing — nothing becomes public without human approval.
- ❌ High-frequency polling, parallel hammering, or multiple concurrent requests
  to the host.

---

## Feed-only strategy

- Maintain an **allowlist** of feeds in the DB (`feed_sources`), not hardcoded.
- Prefer **targeted store/category feeds** for the ~8 merchants we already track
  over the global firehose — lower volume, higher relevance.
- One scheduled job iterates enabled feeds **sequentially** (concurrency = 1),
  conditional-GETs each, parses the XML, and **upserts raw items** into
  `feed_items` keyed by the OzBargain node id (idempotent).
- The job **stops at parsing** — it never opens item links or fetches detail
  pages.
- First runs are **manual** (`npm run monitor`-style script); scheduling via
  Vercel Cron comes only after manual runs prove safe.

### No user-triggered live fetch rule

> **A user action must never cause an outbound OzBargain request.**

- Search, store pages, and `/deals` read **only our Supabase DB** (or the static
  fallback). They already do this today.
- The **only** code paths allowed to fetch are the scheduled cron route and the
  manual monitor script. The fetcher module must never be imported by a
  request-handling page or public API route.
- This is verified in the [testing checklist](#testing-checklist) (grep proves
  `fetch` lives only in the monitor entry points).

---

## Admin review queue flow

```
            (scheduled, slow, feed-only)
 OzBargain feed ──► fetch + parse ──► feed_items (review_state = new)
                                            │
                                   Admin review queue UI
                                   /admin/signals/queue
                                            │
              ┌─────────────┬───────────────┴───────────────┐
              ▼             ▼                                ▼
           Ignore        Duplicate                  Import as signal
      (review_state    (review_state           (creates ozbargain_signals
        = ignored)      = duplicate)             row, status = PENDING,
                                                 review_state = imported)
                                                         │
                                              Admin moderation
                                                         │
                                      ┌──────────────────┼──────────────┐
                                      ▼                  ▼              ▼
                                 approved            hidden          expired
                              (PUBLIC via RLS)    (reversible)    (reversible)
                                      │
                         Homepage Top 5 when feed-item
                         curation + live-state checks pass
```

- The queue lists `feed_items` where `review_state = 'new'`, service-role read,
  behind `requireAdmin()`.
- Each row shows the raw title, source link (display only / `nofollow`, not
  auto-opened), an **auto-suggested merchant** (via `lib/sources/normalise.ts`),
  a heuristic `deal_kind`, posted date, and the feed source.
- Importing reuses the **existing signal create form**, prefilled — the admin
  edits the paraphrase, confirms the merchant, and saves as `pending`.
- Nothing in this flow publishes; only the later `approved` transition does.

---

## Tables planned

All three are **service-role only** — no anon RLS policies. Only the existing
`ozbargain_signals` table (with its `status = 'approved'` policy) is ever public.

### `feed_sources` — allowlist + polling state

| Column | Notes |
|---|---|
| `id` | PK |
| `label` | Human name, e.g. "JB Hi-Fi store feed" |
| `feed_url` | The permitted feed URL |
| `kind` | `front` \| `store` \| `category` |
| `merchant_id` | Nullable FK to `stores` |
| `is_enabled` | **Default `false`** — feeds start off |
| `etag` / `last_modified` | For conditional GET |
| `last_fetched_at` / `last_status` | Last run outcome |
| `failure_count` / `next_earliest_fetch_at` | Backoff state |

### `feed_items` — raw snapshots / dedupe / triage

| Column | Notes |
|---|---|
| `id` | PK |
| `feed_source_id` | FK → `feed_sources` |
| `source_native_id` | **Unique** — OzBargain node id (idempotent upsert key) |
| `link` | Canonical source URL |
| `raw_title` / `raw_summary` | Stored for review; public copy is our paraphrase |
| `categories` | Text array |
| `posted_at` / `fetched_at` | Timestamps |
| `content_hash` | Detect changed re-posts |
| `review_state` | `new` \| `imported` \| `ignored` \| `duplicate` |
| `promoted_signal_id` | Nullable FK → `ozbargain_signals` once imported |
| `hidden_from_homepage` | Independent Top 5 curation veto; default `false` |

### `feed_fetch_log` — per-run audit / observability

| Column | Notes |
|---|---|
| `id` | PK |
| `feed_source_id` | FK → `feed_sources` |
| `started_at` / `finished_at` | Run window |
| `http_status` | Incl. `304` (not-modified) |
| `items_seen` / `items_new` | Volume |
| `error` | Nullable error detail |

---

## How a feed item becomes an `ozbargain_signals` row

Mapping `feed_item` → the existing `SignalInput` shape used by
`lib/admin/repos/signals.ts`:

| Signal field | Source |
|---|---|
| `title` | `raw_title` (admin-editable) |
| `summary` | **Admin paraphrase** — never raw copy |
| `sourceUrl` | `feed_item.link` |
| `merchantId` | Auto-matched (`normalise`), **admin-confirmed** |
| `dealKind` | Heuristic guess, admin-editable |
| `sourceNativeId` | Carried through (dedupe key) |
| `isSample` | `false` (real signal) |
| `confidence` | `needs-verification` default |
| `status` | **`pending`** — importer never writes `approved` |

- Promotion is **idempotent**: if an `ozbargain_signals` row with that
  `source_native_id` already exists, link to it via
  `feed_items.promoted_signal_id` instead of inserting a duplicate.
- On import: set `feed_items.review_state = 'imported'` and reuse the existing
  `insertSignal()`; the admin later approves via `setSignalStatus()`, which
  revalidates `/deals` and `/`.

---

## Status lifecycle

Two **separate** state machines: ingestion triage vs. publication moderation.

### `feed_items.review_state` (ingestion triage)

| State | Meaning |
|---|---|
| `new` | Freshly fetched; awaiting admin triage in the queue |
| `imported` | Promoted to a `pending` signal |
| `ignored` | Admin dismissed it (not relevant) |
| `duplicate` | Already covered by an existing signal |

### `ozbargain_signals.status` (publication moderation)

| State | Meaning | Public? |
|---|---|---|
| `pending` | Imported, awaiting approval | No |
| `approved` | Admin-approved | **Yes** (anon RLS) |
| `hidden` | Spam/irrelevant; reversible | No |
| `expired` | Past offer; reversible | No |

- **Only `approved` is public.** The importer never writes `approved`.
- **Auto-expire is the only non-human transition**: a conservative scheduled
  pass flips `approved → expired` once `expiry_date` passes (or after N stale
  days). It never auto-approves and never deletes — fully reversible.

### Homepage Top 5 publication contract

The homepage uses the feed row only for ingestion/curation state and ranking
recency. It joins through `feed_items.promoted_signal_id` and renders the
approved signal's edited title, summary, tags, source URL and posted date. Raw
feed title, summary, link and categories are never public copy.

| Feed item | Promoted signal | Top 5 result |
|---|---|---|
| `new` | none or any status | Hidden |
| `imported` | `pending` | Hidden |
| `imported`, `hidden_from_homepage = false` | approved, non-sample, not past expiry | Eligible |
| `imported`, `hidden_from_homepage = true` | approved | Hidden |
| `imported` | hidden, expired, sample, or hard-expired by date | Hidden |
| eligible imported item from a disabled feed source | approved and live | Still eligible |

`feed_sources.is_enabled` is an operational fetch switch, not a publication
state. Disabling a source stops future requests but does not unpublish content
that already passed moderation. Approval, hiding, expiry and edited-copy saves
revalidate the homepage through the signal admin actions.

---

## Backoff / rate-limit rules

- [ ] Slow fixed cadence (e.g. every **6–12h**), configurable; never minutes.
- [ ] Conditional GET first; a `304` short-circuits with no further work.
- [ ] Sequential per host (concurrency = 1), small delay between feeds.
- [ ] Per-request timeout; hard caps on requests/run and runs/day.
- [ ] Exponential backoff keyed on `feed_sources.failure_count`; honour
      `Retry-After`; push out `next_earliest_fetch_at` on `429 / 403 / 5xx`.
- [ ] After a failure threshold, **auto-disable** the offending feed and surface
      it to the admin.
- [ ] Any Cloudflare challenge / unexpected HTML → treat as blocked: stop,
      disable, alert. **Never** attempt a bypass.

---

## Kill switch rules

Admins can use **Disable all feed sources** on `/admin/monitor` for an audited,
immediate DB-level stop. It disables only `feed_sources.is_enabled`; staged
items and approved public data are preserved. The homepage publication query
does not filter on source enablement.

Defence in depth — the monitor must be stoppable instantly at multiple levels:

- [ ] **Deploy-level master**: env flag `OZB_MONITOR_ENABLED` (default **off**),
      checked at the very top of the job via the lazy `lib/env.ts` pattern. Off
      = zero outbound requests.
- [ ] **DB-level toggles**: a global enable flag + per-feed
      `feed_sources.is_enabled`, flippable from the admin UI **without a
      redeploy**.
- [ ] **Auto-kill**: backoff threshold disables a feed; repeated global failures
      disable all feeds.
- [ ] **Decoupling guarantee**: the public site never imports the fetcher
      module; the public experience is unaffected when the monitor is off.

---

## Manual review requirements

These **always** stay human — never automated:

- [ ] **Publication** (`pending → approved`).
- [ ] The summary/paraphrase wording (no raw content copy).
- [ ] Merchant-match confirmation (auto-suggested, human-confirmed).
- [ ] Ambiguous `deal_kind` / `expiry` decisions.
- [ ] Enabling feeds and raising cadence.
- [ ] The compliance decision itself.
- [ ] The importer **never** writes `approved`, never publishes directly, and
      never touches the public table as visible.

---

## Build order checklist

Each step is independently shippable and safe. **Do not start step 2 until the
[Compliance rules](#compliance-rules) checklist is complete.**

- [ ] 1. Compliance pre-flight: `robots.txt` + ToS review, decision log, chosen
      feeds, `User-Agent` string. *(No fetching code.)*
- [x] 2. Migration: `feed_sources`, `feed_items`, `feed_fetch_log` +
      service-role-only RLS; feeds seeded **disabled by default**. *(Done —
      `supabase/migrations/002_feed_import_queue.sql`. Schema only; no fetcher.)*
- [x] 3. Pure parser/mapper lib (XML → raw item → `feed_items` shape),
      unit-tested against committed **fixture feeds**, zero network. *(Done —
      `lib/monitor/parseFeed.ts`, `lib/monitor/mapFeedItem.ts`,
      `tests/monitor/parseFeed.test.ts`; run `npm run test:monitor`. Offline
      only; no fetcher.)*
- [x] 4. Fetcher module (kill switch, conditional GET, backoff) run as a manual
      script writing only to `feed_items` / `feed_fetch_log` / `feed_sources`
      poll-state; env flag default off. *(Done — `lib/monitor/fetchFeed.ts`,
      `lib/monitor/backoff.ts`, `lib/monitor/runMonitor.ts`,
      `scripts/monitor-feeds.ts`; `npm run monitor:feeds -- --dry-run`. Dry run is
      the default; writes need `--write`. Still no cron.)*
- [ ] 5. Admin review queue UI (list / ignore / import), reusing the signal
      form; promote → `pending`.
- [ ] 6. Auto-expire job (conservative, reversible).
- [x] 7. Schedule via Vercel Cron at low cadence. *(Done —
      `app/api/cron/monitor-feeds/route.ts` + `vercel.json`, daily at 02:00 UTC
      (a once-per-day cadence that also fits the Vercel Hobby plan cron limit). The
      route is secret-gated (`CRON_SECRET` → 503 if unset, 401 on mismatch),
      flag-gated (`OZB_MONITOR_ENABLED`), and compliance-gated
      (`isMonitoringApproved`); it runs the shared `runMonitor()` in write mode to
      the staging tables only — never `ozbargain_signals`. Off by default; enable
      real feeds only after clean staging dry runs. Gate tests:
      `tests/monitor/cronRoute.test.ts`.)*
- [~] 8. Observability + alerts + admin kill-switch toggle. *(Partial — a
      read-only status page exists at `/admin/monitor`
      (`lib/admin/repos/monitorStatus.ts`): master-switch value, compliance
      approval, feed-source counts, queue backlog, recent fetch log, and
      error/blocked feeds. No fetch controls; alerts + toggle still pending.)*

---

## Implementation Plan

> **Do not implement automated fetching until compliance review is complete.**
>
> This section is the build spec for the monitor. No fetcher, cron route, or
> monitor script exists yet, and none may be added until the
> [Compliance decision log](#compliance-decision-log) has an approved entry. The
> invariants still hold: **feed-only**, **no user-triggered fetches**, the
> importer writes **only** `feed_items` (never `ozbargain_signals`), and **admin
> approval stays mandatory**. Everything ships **off by default**.

### Compliance preflight checklist

The actionable version of [Compliance rules](#compliance-rules) — every box must
be checked and logged before any feed or the env master switch is enabled:

- [ ] Read OzBargain `robots.txt` manually (in a browser, **not** via the app);
      record Allow/Disallow for each intended feed path vs `*` and our UA.
- [ ] Read OzBargain Terms / any feed or scraping/API policy; confirm low-volume
      RSS syndication is permitted; record verdict + links.
- [ ] Confirm the targets are RSS/Atom feeds intended for syndication (not HTML).
- [ ] Determine an acceptable cadence and any stated rate limit; set the schedule
      well under it.
- [ ] Finalise the **exact allowlist** of feed URLs; map each to a `merchant_id`
      where store-specific.
- [ ] Finalise the **User-Agent** (identifying + contact URL).
- [ ] Confirm conditional-GET support (ETag / Last-Modified) on those feeds.
- [ ] Record date / reviewer / links / allowed URLs in the
      [Compliance decision log](#compliance-decision-log).
- [ ] Define a re-review trigger (terms or `robots.txt` change).
- [ ] **Gate:** do not set `OZB_MONITOR_ENABLED=true` or any
      `feed_sources.is_enabled=true` until every box above is checked.

### Candidate feed URL patterns (to verify)

Register all in `feed_sources` **disabled**, only after preflight verifies each.
These are candidate *patterns* to confirm during preflight — do not assume they
are correct or permitted:

| Type | Candidate pattern | Notes |
|---|---|---|
| Store / node | `…/store/<slug>/feed` | One per tracked merchant (myer, jb-hifi, the-good-guys, woolworths, coles, kogan, amazon, chemist-warehouse). **Preferred** — low volume, high relevance, maps cleanly to `merchant_id`. |
| Tag / category | `…/tag/<tag>/feed` | For gift-card / cashback / points-relevant tags. |
| Front deals | `…/deals/feed` | Firehose — high volume; avoid initially or filter hard. |

**Recommendation:** start with **1–2 store feeds** for tracked merchants, not the
front-page firehose. Map each `Store.id` → its OzBargain store slug in preflight.

### Required User-Agent format

Descriptive, identifying, with a contact URL — **never** a spoofed browser
string (that would be evasion):

```
DealStackAU/1.0 (+https://<site>/about; feed monitor; contact: <owner-email>)
```

Sent on every request via `OZB_MONITOR_USER_AGENT`, alongside
`Accept: application/rss+xml, application/atom+xml, application/xml;q=0.9` and the
conditional-GET headers.

### Backoff / retry rules

- **Cadence:** fixed slow schedule (cron every 6–12h); a per-feed
  `next_earliest_fetch_at` gate skips feeds not yet due.
- **Conditional GET:** send `If-None-Match`(etag) / `If-Modified-Since`. `304` =
  success, no parse, `items_seen = 0`.
- **Per request:** ~10s timeout; at most **one** retry on a transient network
  error/5xx with short jittered delay; honour `Retry-After` on `429`/`503`.
- **Sequencing:** concurrency = 1, a small delay (2–5s) between feeds; hard caps
  on feeds/run and requests/run.
- **Failure backoff:** `failure_count++` and
  `next_earliest_fetch_at = now + base · 2^failure_count` (capped ~24–48h), or
  `Retry-After` if larger.
- **Auto-disable** at `failure_count ≥ 5`: set `is_enabled=false`,
  `last_status='error'|'blocked'`, surface to admin.
- **Blocked detection:** non-2xx/304, an HTML/Cloudflare-challenge body, or a
  non-XML content-type → `last_status='blocked'`, stop, **no bypass**.
- Every run writes a `feed_fetch_log` row.

### Kill switch env vars

Layered — the env master OFF always beats a DB `is_enabled=true`. Documented
(commented, default off) in `.env.example`; lazy helpers added to `lib/env.ts`:

| Var | Default | Purpose |
|---|---|---|
| `OZB_MONITOR_ENABLED` | `false` | Master switch, checked at the very top of the fetcher **and** the cron route. Off → immediate no-op, zero outbound requests. |
| `CRON_SECRET` | — | Secret the cron route checks (`Authorization: Bearer …`, set/sent by Vercel) so it can't be publicly triggered. |
| `OZB_MONITOR_USER_AGENT` | — | The UA string (above); updatable without a code redeploy. |
| `OZB_MONITOR_MAX_FEEDS_PER_RUN` | small const | Hard cap on feeds touched per run. |
| `OZB_MONITOR_MIN_INTERVAL_HOURS` | conservative const | Floor on per-feed polling interval. |

Plus the DB-level kill: per-feed `feed_sources.is_enabled` (+ an admin UI toggle
later).

### Manual run script design

- `scripts/monitor-feeds.ts`, npm script `"monitor:feeds": "tsx scripts/monitor-feeds.ts"`
  — the **first** way to run, before cron exists.
- Loads `.env.local` and uses the service-role client (like the seed scripts).
- Flags: `--dry-run`, `--fixtures`, `--source=<id>` (single feed), `--once`.
- Calls the shared `runMonitor()` core (same code the cron uses); prints a
  summary (feeds checked, 304s, new items, errors).
- Writes only `feed_items` + `feed_sources` poll-state + `feed_fetch_log`;
  **never** `ozbargain_signals`.

### Vercel Cron route design

- `app/api/cron/monitor-feeds/route.ts` — a `GET` handler matching the existing
  route-handler style (`app/admin/auth/callback/route.ts`).
- `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/monitor-feeds", "schedule": "0 2 * * *" }] }
  ```
- **Auth:** require `Authorization: Bearer ${CRON_SECRET}` → else `401`. No public
  triggering.
- Top of handler: if `!OZB_MONITOR_ENABLED`, return `200 {disabled:true}` without
  fetching.
- Calls `runMonitor()`, catches errors → JSON summary (a feed failure must not
  500 the cron); `export const dynamic = "force-dynamic"`, set `maxDuration`.
- This is the **only** request path that can fetch; it is secret-gated **and**
  flag-gated, and no page imports the fetcher, so user searches never reach it.

### Dry-run mode

- Runs the full pipeline **except DB writes** — fetch/parse/map and **log what it
  would insert**; no `feed_items`/poll-state writes, nothing enabled.
- Two sub-modes:
  - `--dry-run` against live feeds (read-only) — validates parsing/dedupe; still
    respects robots/UA/backoff/kill switch.
  - `--fixtures` (offline) — reads committed sample XML, **no network at all**;
    the safe default for first runs and CI.
- Output: parsed items (native id, title, guessed `deal_kind`, dedupe key) +
  counts, under a clear `DRY RUN — no writes` banner.

### Fixture XML testing plan

- Commit sample feeds under `tests/fixtures/ozbargain/*.xml` (handcrafted or
  saved once manually — **not** fetched by the app), covering: a normal item, an
  item missing fields, HTML in `<description>`, a duplicate guid, a malformed
  entry.
- Add a test runner and unit tests for `parseFeed()`, `mapFeedItem()`, dedupe by
  `source_native_id`, HTML-stripping, and date parsing. Assert the parser/mapper
  layer contains **no `fetch`**.
- `--fixtures` mode runs the whole pipeline offline (dry-run or into staging).
- **Order:** fixtures+unit green → `--dry-run` vs one live feed on **staging** →
  single live write on staging → enable one feed in prod with the kill switch
  armed.

### Future files to create (none yet)

| File | Purpose |
|---|---|
| `lib/monitor/parseFeed.ts` | Pure RSS/Atom XML → raw items (needs an XML parser dep). |
| `lib/monitor/mapFeedItem.ts` | Raw item → `feed_items` row + `content_hash` + dedupe key. Pure. |
| `lib/monitor/fetchFeed.ts` | Conditional GET one feed (UA, timeout, ETag/Last-Modified, blocked detection). **Only networked module.** |
| `lib/monitor/backoff.ts` | `failure_count` → `next_earliest_fetch_at`; `Retry-After`. Pure. |
| `lib/monitor/runMonitor.ts` | Orchestrator: select due+enabled feeds → fetch→parse→map→upsert `feed_items`, write `feed_fetch_log`, update poll-state. Honours kill switch + dry-run. Shared by script & cron. |
| `lib/admin/repos/feedSources.ts` | Service-role ingestion writes (poll-state, `feed_items` upsert, `feed_fetch_log`). Complements the existing `feedQueue.ts` (item→signal promotion). |
| `lib/env.ts` (edit) | `ozbMonitorEnabled()`, `cronSecret()`, `ozbMonitorUserAgent()`, and the cap/interval reads. |
| `scripts/monitor-feeds.ts` (+ npm script) | Manual runner. |
| `app/api/cron/monitor-feeds/route.ts` | Secret-gated cron route. |
| `vercel.json` | Cron schedule. |
| `tests/fixtures/ozbargain/*.xml` + `tests/monitor/*.test.ts` (+ runner config) | Offline fixture/unit tests. |
| `.env.example` (edit) | Document the new vars, default off. |

### Dependencies to consider later

- **`fast-xml-parser`** — pure RSS/Atom XML parsing (no network).
- **`vitest`** — test runner for the fixture/unit tests (none exists today).

Both are added **only** when build-order step 3 begins, after compliance sign-off.

### Open decisions

- **First feeds:** 1–2 store feeds for tracked merchants *(recommended)* vs a tag
  feed.
- **Cron cadence:** every 12h *(recommended)* vs 6h.
- **XML parser / test runner:** `fast-xml-parser` + `vitest` *(recommended)* vs
  alternatives.
- **Dry-run surface:** secret-gated `?dryRun=1` on the route, or dry-run
  script-only *(recommended to start)*.

---

## Running the manual monitor (Phase 1)

The first and only way to run the monitor today — a **manual script**, no cron, no
route, no agent. Dry run is the default; nothing is written unless you pass
`--write`.

```bash
# Dry run all enabled, due feeds (fetch + parse, write nothing):
npm run monitor:feeds -- --dry-run

# Dry run a single feed by feed_sources id:
npm run monitor:feeds -- --source=<feed_source_id> --dry-run

# Live run (stages feed_items + poll-state + a fetch-log row; never publishes):
npm run monitor:feeds -- --write
```

Behaviour and guarantees (enforced in code, covered by `npm run test:monitor`):

- **Kill switch first.** If `OZB_MONITOR_ENABLED` is not exactly `true`, the script
  prints a notice and exits with **zero** outbound requests.
- `OZB_MONITOR_USER_AGENT` is **required only when enabled** (an identifying UA with
  a contact URL — never a spoofed browser string).
- **Feed-only, concurrency 1**, at most `OZB_MONITOR_MAX_FEEDS_PER_RUN` (default 1)
  feeds per run; only **enabled** `feed_sources` that are **due**
  (`next_earliest_fetch_at` null or past) are fetched.
- **Conditional GET** via `ETag` / `Last-Modified`; a `304` is a no-op success.
- A **non-XML / HTML / Cloudflare-like** body is treated as **blocked** → the run
  stops and (live) the feed is auto-disabled. **No bypass, ever.**
- Live writes touch **only** `feed_items`, `feed_fetch_log`, and `feed_sources`
  poll-state — **never** `ozbargain_signals`. Imported items still require manual
  admin approval via `/admin/signals/queue`.

## Scheduling the monitor

**One trigger drives the pipeline: Vercel Cron, once a day.** `vercel.json`
runs `GET /api/cron/monitor-feeds` at `00:00 UTC`:

```json
{ "crons": [{ "path": "/api/cron/monitor-feeds", "schedule": "0 0 * * *" }] }
```

Keep this **once daily** — the Vercel Hobby plan only permits one daily cron.
When `CRON_SECRET` is set in the project env, Vercel sends
`Authorization: Bearer ${CRON_SECRET}` automatically. Every authenticated call
runs the **full daily pipeline** (`runDailyPipeline`, `lib/monitor/runDailyPipeline.ts`):
archive expired public rows, then — when monitoring and compliance are both
enabled — status-only HEAD validation of approved signals
(`lib/monitor/validateSourcePost.ts`) followed by the feed fetch, all in one
invocation. This is not the old "fetch-only" route: gate order and response
shape changed with migration 015/016 — see below.

### Current gate order and response

1. `CRON_SECRET` configured (else `503`).
2. Valid `Authorization: Bearer` (else `401`).
3. **Run lock** (migration 016): if another invocation already holds the
   single `status = 'running'` row in `daily_pipeline_runs`, this call does
   nothing at all — no archive, no validation, no fetch, no run row written —
   and returns `200 { ok: true, ran: false, skipped: "already-running" }`. A
   `running` row older than 30 minutes is treated as crashed and is
   superseded before the next attempt, so a dead invocation cannot wedge the
   lock open forever.
4. Otherwise the pipeline runs. `OZB_MONITOR_ENABLED` and compliance approval
   gate the validation + fetch steps only — **archival always runs** (it
   never makes an external request). The response body is the full
   `daily_pipeline_runs` patch: `status` (`ok`/`partial`/`error`/`disabled`/`blocked`),
   `expiredArchived`, `invalidArchived`, `validationChecked`,
   `validationUnknown`, `feedsProcessed`, `itemsFetched`, `itemsNew`,
   `itemsUpdated`, `itemsSkipped`, `errors`. HTTP status is `500` only when
   `status === "error"`; every other outcome (including `disabled` and
   `blocked`) is `200`.

### No external fetch-triggering scheduler is deployed

An earlier draft of this document recommended pointing an external service
(e.g. cron-job.org) at this route every 3 hours for tighter polling. **That was
never wired up in production.** The option actually chosen instead is a
**read-only** health-check probe — `.github/workflows/monitor-health.yml` —
which polls `GET /api/health/monitor` and `GET /api/health/data` every 3 hours
and fails the GitHub Action (alerting via workflow-failure notifications) on
any non-2xx. It never calls this cron route and never fetches OzBargain; it
only reads our own health/data-freshness endpoints. **Do not** add a
fetch-triggering external scheduler for this route without updating this
section — the single daily Vercel Cron plus the run lock above is the current
and only intended trigger of `runDailyPipeline`. If tighter polling is ever
wanted, the run lock (migration 016) makes overlapping triggers safe by
construction, but every step's idempotency was designed around one run per
day and an extra trigger multiplies outbound HEAD-validation requests against
OzBargain — record that decision here before enabling it.

## Testing checklist

- [x] Manual queue test data: `npm run seed:feed-items` inserts a **disabled**
      example feed source + a few clearly-fake `feed_items`
      (`example-seed-*` ids, `example.com` links) so `/admin/signals/queue` can
      be exercised. Safe to re-run; no network, no OzBargain fetch.
      *(`scripts/seed-feed-items.ts`.)*
- [x] Unit-test parser/mapper against saved fixture XML — **no network**.
      *(`npm run test:monitor` — RSS + Atom basics, HTML stripping, duplicate
      guid dedupe, missing-description fallback, id/hash generation.)*
- [x] Fixture dry-run: `npm run monitor:fixtures` reads the local fixture XML,
      parses + maps it, and prints what it *would* stage — no Supabase client,
      no fetch, no writes. *(`scripts/monitor-fixtures.ts`.)*
- [x] Live `--dry-run` mode (read-only against a real feed): logs what it
      *would* insert; no writes. *(Done — `npm run monitor:feeds -- --dry-run`,
      the default mode of `scripts/monitor-feeds.ts`. Unit-tested offline in
      `tests/monitor/runMonitor.test.ts` incl. the kill switch and "dry run
      writes nothing" invariants.)*
- [ ] Use a **staging** Supabase project for first live fetches, never prod.
- [ ] First live run: single feed, manual invocation, kill switch armed; inspect
      `feed_fetch_log` + `feed_items`; confirm a second run returns `304`.
- [ ] RLS: anon **cannot** read `feed_items` / `feed_sources` / `feed_fetch_log`;
      public site still shows only `approved` signals.
- [ ] Decoupling: with the monitor disabled, `/search` and store pages are
      unchanged; grep proves `fetch` lives only in the monitor entry points.
- [ ] Backoff: mock a `429` with `Retry-After`; assert next-fetch math +
      auto-disable.
- [ ] Confirm `User-Agent` and `robots.txt` are respected.

---

## Compliance decision log

> Fill this in during build-order step 1. The monitor must not fetch until this
> table has an approved entry.
>
> **Recorded in the admin UI** at `/admin/compliance` (service-role only), backed
> by the `compliance_reviews` table
> (`supabase/migrations/003_compliance_review.sql`). A review with
> `approved_for_monitoring = true` is the gate, and an **approved review is now on
> file** there (the DB row is the source of truth; the table below is the
> human-readable mirror — fill in the specifics from the admin UI).
>
> Approval unblocks building the Phase 1 manual dry-run script. It does **not**
> auto-enable anything: `OZB_MONITOR_ENABLED` stays off and each `feed_sources`
> row stays disabled until an operator turns them on deliberately.

| Date | Reviewer | robots.txt OK? | ToS/feed policy OK? | Allowed feed URLs | Notes |
|---|---|---|---|---|---|
| see `/admin/compliance` | see admin UI | ✓ | ✓ | register in `feed_sources` (disabled) | Approved review on file in `compliance_reviews`; mirror the specifics here. |

### Addendum: status-only post validation (2026-07-11)

The 2026-06-20 review above covered **RSS feed polling**. Migration 015 added
a second, distinct kind of outbound request: `lib/monitor/validateSourcePost.ts`
sends a `HEAD` request to an individual approved signal's OzBargain post URL as
part of the daily pipeline's live-signal validation, to detect posts that have
been removed (`404`/`410`) so the linked public signal can be archived. This is
recorded here as its own addendum rather than folded into the row above because
it is a different request shape against the same host, not a new source.

Scope and safeguards (mirrors the feed-fetch invariants):

- **HEAD only** — no response body is ever downloaded or parsed; nothing is
  scraped.
- **Host- and path-allowlisted** — `isApprovedOzBargainPostUrl()`
  (`lib/security/urlPolicy.ts`) accepts only `ozbargain.com.au` /
  `www.ozbargain.com.au` and an exact `/node/<id>/` post path; anything else
  is treated as `unknown` and never fetched. On a redirect, the target must
  stay within that same approved host/path shape or the post is treated as
  `removed`.
- **Bounded** — 5 second timeout, at most 2 redirects, batches of 4 concurrent
  checks, capped at 100 signals per run (the daily due-window is 20 hours, so
  a signal is checked at most once per day).
- **Same identifying `User-Agent`** as feed polling (`OZB_MONITOR_USER_AGENT`).
- **Fails safe** — a network error, timeout, or any non-2xx/404/410 response
  is recorded as `unknown` and never archives the signal; only a definitive
  `404`/`410` (or a redirect leaving the approved post boundary) does.
- Gated by the same `OZB_MONITOR_ENABLED` + compliance-approved checks as
  feed fetching — off means zero validation requests, same as zero feed
  requests.

No separate `robots.txt`/ToS re-review was conducted for this addendum on the
basis that it targets the same already-reviewed host with a lighter-weight,
non-crawling request (a single `HEAD` per post, no pagination, no content
retrieval). Re-review this addendum alongside the next scheduled compliance
re-check (see the top-of-file re-review rule) rather than treating it as a
standalone gate.

---

## Status

**Current phase: Phase 1 — manual dry-run fetcher + secret-gated cron in place. No agent.**
On top of the staging schema (`002_feed_import_queue.sql`) and the pure offline
parser/mapper (`lib/monitor/parseFeed.ts`, `lib/monitor/mapFeedItem.ts`), the
monitor now has:

- `lib/monitor/fetchFeed.ts` — the single networked module: one conditional GET
  per feed (identifying UA, XML Accept, timeout, ETag/Last-Modified, blocked
  detection). No HTML/page crawling, no anti-bot bypass.
- `lib/monitor/backoff.ts` — pure backoff / Retry-After / auto-disable math.
- `lib/monitor/runMonitor.ts` — orchestrator (kill switch, sequential, capped,
  dry-run-aware); writes only the staging tables + poll-state, never
  `ozbargain_signals`.
- `lib/admin/repos/feedSources.ts` — service-role ingestion writers backing the
  orchestrator's persistence contract.
- `scripts/monitor-feeds.ts` (+ `npm run monitor:feeds`) — the manual runner;
  **dry run by default**, `--write` to stage. See
  [Running the manual monitor](#running-the-manual-monitor-phase-1).

Unit-tested offline (`npm run test:monitor`): parser/mapper, backoff math,
blocked-body detection, and the orchestrator's kill-switch + "dry run writes
nothing" + "blocked stops & disables" invariants.

Feed egress is restricted to exact approved HTTPS hosts. For `ozbargain`, only
`ozbargain.com.au` and `www.ozbargain.com.au` are accepted. Redirects are
followed manually (maximum three), stay on the same approved hostname, and are
revalidated before every request. Successful bodies are limited to 2 MiB and
the deadline remains active while the body is read.

For silent-stall alerting, poll `GET /api/health/monitor` every three hours from
an external uptime service with the same Bearer secret. `200` means off, paused,
or fresh; `503` means missing compliance, no successful run within 30 hours
while feeds are expected, or unreadable state. Alert on non-2xx and timeout.
**Implemented 2026-07-11 via `.github/workflows/monitor-health.yml`** (GitHub
Actions schedule, fails on non-2xx → GitHub failure notification; needs the
`CRON_SECRET` repository Actions secret — see FINAL-LAUNCH-CHECKLIST §4).

**Now added (cron Phase 1):** a secret-gated Vercel Cron route
(`app/api/cron/monitor-feeds/route.ts` + `vercel.json`, `GET`, daily at 02:00 UTC) that
runs the shared `runMonitor()` in **write mode to the staging tables only**. It is
gated three ways — `CRON_SECRET` (503 when unset, 401 on mismatch — Vercel Cron
sends the bearer automatically), `OZB_MONITOR_ENABLED` (master kill switch), and
an approved compliance review — and it **never** writes `ozbargain_signals`, so
admin review stays mandatory. No page imports the fetcher, so user traffic still
cannot trigger it. Gate behaviour is unit-tested in
`tests/monitor/cronRoute.test.ts`.

**Still not built (out of scope):** the auto-expire job and any user-triggered
fetch. There is **no agent**. The master switch (`OZB_MONITOR_ENABLED`) defaults
**off**, every feed in `feed_sources` starts **disabled**, and the cron route
re-checks compliance at request time — so a fresh deploy makes **no** outbound
requests even with the cron scheduled.

> **Automated scheduling (cron) stays gated** — only enable real feeds and raise
> cadence after manual dry runs against a staging project look clean.

## Offer-change detection: go-live runbook

Offer-change detection scans already-staged feed items and stages
`offer_change_candidates` for admin review. It is **built but dark**: the pure
pipeline (`lib/monitor/detectOffers.ts`, `lib/monitor/runDetection.ts`), the
post-run cron hook (`app/api/cron/monitor-feeds/route.ts`), and the admin
preview panel (`app/admin/(protected)/offer-changes/DetectionPreviewClient.tsx`)
all exist and are tested, but `OZB_OFFER_DETECT_ENABLED` has never been flipped —
so `offer_change_candidates` has zero rows. Detection **never auto-applies**:
even once enabled, a candidate only changes a published offer when an admin
clicks **Apply** on `/admin/offer-changes`. Post-enable status is visible on
[`/admin/monitor`](../app/admin/(protected)/monitor/page.tsx) in the
**Offer-change detection** card (flag state, per-review-state counts, last-staged
time).

Follow these four steps to take it live safely.

1. **Precision review (repeat on ≥2 different days).** Open
   `/admin/offer-changes` → **Preview detection (dry run)** → run it. The preview
   scans the last **7 days** of staged items, capped at 200
   (`DETECTION_SCAN_LIMIT`, `lib/monitor/runDetection.ts`). Judge every
   candidate: is the provider right, the merchant right, the value real?
   **Zero candidates is a plausible, healthy result** — the heuristics demand a
   provider *and* a parseable value *and* a resolvable merchant (precision over
   recall), so an empty preview is not a bug and does not block go-live. Review
   on two separate days so a quiet day is not mistaken for a broken detector.

2. **Flip the flag.** Vercel → Settings → Environment Variables → add
   `OZB_OFFER_DETECT_ENABLED=true` (Production) → **redeploy**. The flag is
   already documented in `.env.example`. Nothing else changes: the monitor
   fetch, gates, and cadence are untouched.

3. **Verify within a day.** The daily Vercel Cron (02:00 UTC), or an external
   scheduler run, now returns a `detection` block in its JSON summary. Once
   anything stages, `/admin/monitor` shows a non-null "Last candidate staged"
   time, and candidates appear on `/admin/offer-changes` as
   `review_state = 'new'` for normal human review. **Nothing auto-applies** —
   Apply remains the only path to public data. Note the preview scans **7 days**
   but the live cron hook scans only the last **24 hours**, so a preview showing
   5 candidates does **not** mean the first live run stages 5; expect fewer.

4. **Rollback.** Remove the env var (or set it to `false`) and **redeploy**. No
   code revert is needed. A detection failure can **never** fail the monitor
   run — the post-run hook is fully wrapped in try/catch
   (`app/api/cron/monitor-feeds/route.ts`), so on error the monitor completes
   normally and the failure is recorded in the run's `detection` block only.
