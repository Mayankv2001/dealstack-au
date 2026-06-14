# OzBargain Monitoring — Planning & Compliance

> **⚠️ Do not implement automated fetching until compliance review is complete.**
>
> This is a **planning and checklist document only**. No fetcher, cron route,
> migration, or network code may be written or merged until the
> [Compliance review](#compliance-rules) checklist below is fully signed off and
> recorded. Until then, OzBargain data stays 100% manual (admin-entered) and the
> static sample fallback continues to serve.

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
  revalidates `/deals`.

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
- [ ] 3. Pure parser/mapper lib (XML → raw item → `SignalInput`), unit-tested
      against committed **fixture feeds**, zero network.
- [ ] 4. Fetcher module (kill switch, conditional GET, backoff) run as a manual
      script writing only to `feed_items`; env flag default off.
- [ ] 5. Admin review queue UI (list / ignore / import), reusing the signal
      form; promote → `pending`.
- [ ] 6. Auto-expire job (conservative, reversible).
- [ ] 7. Schedule via Vercel Cron at low cadence — only after manual runs look
      clean.
- [ ] 8. Observability + alerts + admin kill-switch toggle.

---

## Testing checklist

- [ ] Unit-test parser/mapper against saved fixture XML — **no network in CI**.
- [ ] Dry-run mode (`--dry-run`): logs what it *would* insert; no writes, no
      network.
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

| Date | Reviewer | robots.txt OK? | ToS/feed policy OK? | Allowed feed URLs | Notes |
|---|---|---|---|---|---|
| _pending_ | | | | | |

---

## Status

**Current phase: import-queue schema in place; still no fetching.** Migration
`supabase/migrations/002_feed_import_queue.sql` adds the `feed_sources`,
`feed_items`, and `feed_fetch_log` staging tables (RLS-enabled, service-role
only, feeds disabled by default). There is still **no fetcher, cron, or agent**,
and nothing makes external requests. OzBargain data remains entirely manual
(admin-entered) with the static sample fallback.

> **Do not implement automated fetching until compliance review is complete.**
