# PLAN-admin-cleanup-page — One-click expiry hygiene at /admin/cleanup

> **Rank: 3 of 5 (2026-07-10 backlog).** The cleanup pass
> (`scripts/cleanup-old-deals.ts`) is the only way to unpublish expired-but-live
> offers, and it is CLI-only: it needs a local checkout, `.env.local` with the
> **service-role key**, and a Node switch. Consequence, verified in prod
> 2026-07-10: `gc-tcn-jbhifi` (TCN gift card) **expired 2026-07-02 and is still
> published 8 days later**, and `gc-woolworths-wish` expires today and will join
> it tomorrow. The public read-guard hides expired offers from actionable
> listings, so this is DB hygiene rather than a live lie — but hygiene that rots
> whenever the laptop ritual is skipped. This plan ports the script's
> *reviewable* apply flow into the admin portal: a dry-run-style candidates page
> with per-row and per-section Apply, full mutation discipline
> (requireAdmin → rate limit → audit → revalidate). The CLI script stays
> untouched as the scriptable path.

## Goal

`/admin/cleanup` lists, live from the DB, exactly what the script's dry-run
prints: expired-but-published rows per offer table (incl. weekly deals),
expired approved/pending signals, and abandoned staged feed items (>60 days).
Each row has a confirmed Apply button; each section has "Apply all (N)". Every
apply is conditional (re-checks the row still qualifies), audited, rate-limited,
and revalidates the affected public pages. Report-only sections (published with
no expiry; placeholder copy) render as read-only lists, exactly as the script
treats them.

## Non-goals

- **Never delete anything; never publish anything.** Only the three state flips
  the script already performs: `is_published=false`, signal `status='expired'`,
  feed item `review_state='ignored'`.
- No cron/automation — CLAUDE.md forbids auto-applying offer changes; a human
  clicks, always. Do not wire this into the monitor route.
- No changes to `scripts/cleanup-old-deals.ts` (it remains for CLI use), no
  migrations, no RLS changes, no dashboard redesign.

## Preconditions

- `git pull --rebase`; clean tree; `nvm use 20`.
- Read fully before coding (these are the patterns you clone):
  - `scripts/cleanup-old-deals.ts` — the semantics you are porting: table list,
    filters, `<` vs `<=` on dates, report-only sections.
  - `lib/admin/repos/dashboard.ts:436–441` — the AU-Sydney `en-CA` date
    formatter; your repo must compare dates identically.
  - `app/admin/(protected)/signals/queue/actions.ts` — the canonical action
    file, incl. the bulk pattern (`ignoreVisibleItems`, lines 145–182: **one**
    rate-limit check per batch, one summary audit row).
  - `app/admin/(protected)/offer-changes/actions.ts:31–42` —
    `revalidateAdmin`/`revalidatePublicOffers`, the revalidation vocabulary to
    extend.
  - `components/admin/ActionButton.tsx` — props are `run`, optional `confirm`,
    optional `onError`/`onStart`; standalone mode renders its own error line.
  - `app/admin/(protected)/monitor/page.tsx` — a server-rendered, Card-based
    admin page to copy for layout.
  - `AGENTS.md`; for server actions / `revalidatePath` questions consult
    `node_modules/next/dist/docs/` — but prefer copying the in-repo action
    files, which are known-good for this Next 16 version.

## Files to touch

| File | NEW/EDIT | Change |
|---|---|---|
| `lib/admin/repos/cleanup.ts` | NEW | Read: `listCleanupCandidates()`. Write: three conditional apply functions |
| `app/admin/(protected)/cleanup/page.tsx` | NEW | Server page rendering sections + ActionButtons |
| `app/admin/(protected)/cleanup/actions.ts` | NEW | Server actions: per-row + per-section apply |
| `components/admin/AdminNav.tsx` | EDIT | Add `{ href: "/admin/cleanup", label: "Cleanup" }` to the ops group (after Monitor, line ~36) |
| `tests/admin/cleanup.test.ts` | NEW | Unit tests for the pure date/classification helpers |

## Step-by-step

### Step 1 — repo reads (`lib/admin/repos/cleanup.ts`)

Header comment: SERVICE-ROLE ONLY, mirrors `scripts/cleanup-old-deals.ts`
semantics; never deletes; the script remains the CLI twin (duplication is
deliberate — the script must keep working standalone).

Export a pure helper and constant so tests need no DB:

```ts
/** AU-Sydney calendar date (YYYY-MM-DD) for a given instant. */
export function auToday(now: Date): string        // en-CA + Australia/Sydney fmt
/** Strictly-before compare: expiring *today* is NOT expired. */
export function isExpiredAu(expiry: string | null, todayStr: string): boolean
export const STALE_FEED_DAYS = 60;
```

`listCleanupCandidates()` returns one object with sections, matching the
script's queries exactly:
- `expiredOffers`: for each of `cashback_offers`, `gift_card_offers`,
  `points_offers`, `card_offers`, `weekly_deals`: rows where
  `is_published = true AND expiry_date IS NOT NULL AND expiry_date < auToday`
  (script lines 158–163). Select only the columns needed for the label + a
  `merchant_id` where the table has one (cashback, points; the others don't —
  see schema). Reuse the script's label logic (lines 362–371) as a small
  exported `labelFor(table, row)`.
- `expiredSignals`: `ozbargain_signals` where `status IN ('approved','pending')
  AND expiry_date < auToday` (script lines 196–202).
- `staleFeedItems`: `feed_items` where `review_state='new' AND posted_at IS NOT
  NULL AND posted_at < now-60d ISO` (script lines 240–245 — note it keys on
  **`posted_at`**, not `fetched_at`; keep that).
- Report-only: `publishedNoExpiry` (per offer table, `expiry_date IS NULL`) and
  `placeholderCopy` (reuse `findPlaceholderMarkers` from
  `@/lib/admin/placeholderCopy` over the same columns the script scans, lines
  383–414).

### Step 2 — repo writes (conditional, claim-first)

Three functions; each **re-checks eligibility in the WHERE clause** and
verifies a row was actually claimed:

```ts
export async function applyUnpublishExpired(
  table: "cashback_offers" | "gift_card_offers" | "points_offers" | "card_offers" | "weekly_deals",
  id: string,
  todayStr: string
): Promise<void>
// db.from(table).update({ is_published: false })
//   .eq("id", id).eq("is_published", true)
//   .not("expiry_date", "is", null).lt("expiry_date", todayStr)
//   .select("id")  → throw "no longer eligible" if 0 rows returned
```
Same shape for `applyExpireSignal(id, todayStr)`
(`status → 'expired'`, guard `.in("status", ["approved","pending"])` +
expiry check) and `applyIgnoreStaleFeedItem(id, cutoffIso)`
(`review_state → 'ignored'`, guard `.eq("review_state","new")` +
`.lt("posted_at", cutoffIso)`). The table name comes ONLY from the literal
union parameter — never from client input (injection boundary; same reason the
script hardcodes its unions).

### Step 3 — actions (`app/admin/(protected)/cleanup/actions.ts`)

`"use server"`. Every action: `requireAdmin()` →
`checkAdminRateLimit({ adminEmail: email })` → repo write in try/catch →
`logAudit` → revalidate → `AdminActionResult`.

- `unpublishExpiredAction(table, id)` — validate `table` against the same
  literal union before calling the repo (reject with `{ error }` otherwise);
  audit `action: "cleanup-unpublish-expired"` (distinct from the script's
  `auto-unpublish-expired`, so `/admin/audit` distinguishes click vs script).
- `expireSignalAction(id)` — audit `"cleanup-expire-signal"`.
- `ignoreStaleFeedItemAction(id)` — audit `"cleanup-ignore-stale-feed"`.
- `applySectionAction(section)` — the bulk path, modelled on
  `ignoreVisibleItems`: **one** rate-limit check, then re-list that section's
  candidates server-side (never trust client ids for bulk), loop the applies
  tolerating per-row "no longer eligible" errors, one summary audit row
  (`bulk: true`, counts, capped id list). Cap the loop at 200 as a backstop.

Revalidation: admin — `/admin/cleanup`, `/admin/dashboard`. Public — for
unpublish/expire actions call a local helper copying
`revalidatePublicOffers` (`offer-changes/actions.ts:37–42`) extended with
`/cards` (card offers render there) and `/stores` (index), plus
`/stores/${merchantId}` when the row exposes one. Feed-item ignores revalidate
`/` only if the item was homepage-visible — simplest correct move: always
revalidate `/` too; over-revalidation is harmless, a stale public page is not.

### Step 4 — page (`app/admin/(protected)/cleanup/page.tsx`)

Server component (copy monitor page conventions: `metadata`, Cards, muted
explanatory text). Structure:
- Intro paragraph stating the contract: "Nothing here deletes or publishes.
  Actions unpublish, expire, or ignore — the same changes as
  `npm run cleanup:old-deals -- --write`, with an audit trail." (Australian
  spelling throughout.)
- One Card per actionable section with count in the title, rows as compact
  list: label, expiry/posted date, per-row
  `<ActionButton run={unpublishExpiredAction.bind(null, table, row.id)}
  confirm="Unpublish …? It disappears from public listings.">` — bound server
  actions from a server component; ActionButton standalone mode shows errors
  inline (no client island needed).
- Section-level "Apply all (N)" ActionButton with a confirm string that names
  the count and the state change.
- Empty sections render "(none)" — with current prod data most sections ARE
  empty; only gift cards has 1–2 rows.
- Report-only Cards ("Published with no expiry — review manually",
  "Placeholder copy — replace with verified details, then re-publish") — no
  buttons, link each row to its `/admin/<type>/<id>/edit` page.

### Step 5 — tests (`tests/admin/cleanup.test.ts`)

Pure-function tests (no DB): `auToday` formats a fixed UTC instant to the
correct Sydney date across the DST boundary (e.g. `2026-10-03T14:30:00Z` →
`2026-10-04` after AEDT starts — pick asserted values by computing with the
formatter, not by hand-waving); `isExpiredAu`: yesterday → true, **today →
false**, null → false; `labelFor` covers each table's shape.

### Step 6 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:admin && npm run test:monitor && npm run test:stack
npm run cleanup:old-deals   # CLI dry-run must be unchanged and still work
```
`npm run dev` → `/admin/cleanup`: gift-card section lists `gc-tcn-jbhifi`
(expired 2026-07-02); **dev reads the prod DB — do not click Apply while
testing** unless you intend the real unpublish (it is the correct end state,
but it is a prod mutation: prefer verifying render + confirm dialog, then let
the admin click). Check `/admin/audit` after any applied click.

## Edge cases & traps

1. **Date semantics: strictly less-than, AU-Sydney calendar.** The script and
   the DQ report both compare `expiry_date < TODAY` where TODAY is the
   Sydney-timezone `en-CA` string (script:93–99, dashboard.ts:436–441). A row
   expiring **today** (`gc-woolworths-wish`, 2026-07-10) is *not yet* expired.
   Using `new Date().toISOString()` for "today" silently shifts the boundary by
   up to 11 hours — the classic bug here.
2. **Claim-first writes.** The page renders, the admin walks away, the row gets
   edited or unpublished elsewhere, the admin clicks Apply on stale data.
   Without the WHERE re-check + `.select("id")` length check, PostgREST
   reports success on a 0-row update and the admin believes something happened
   (or worse, an update fires on a row that no longer qualifies).
3. **Bulk must not trust client ids.** `applySectionAction` re-derives the
   candidate list server-side at apply time. The queue's bulk action accepts
   ids because the admin explicitly *selected* them; here "Apply all" means
   "all that currently qualify", which only the server knows.
4. **Rate limit: 30 mutations/60s** (`rate-limit.ts:31–33`). Per-row actions on
   a 25-row backlog would flirt with the cap; the bulk action consumes one
   unit (queue precedent, actions.ts:160–162). Keep both paths.
5. **`weekly_deals` is in `unpublishExpired` but NOT in `flagPublishedNoExpiry`**
   (script main(), lines 365–381) — weekly deals without expiry are normal.
   Mirror the script's table sets exactly; do not "complete" them.
6. **Signals expire from BOTH `approved` and `pending`** (script:201) — not
   just approved. And the update sets `status='expired'`, never touches
   `is_sample` or anything else.
7. **Feed-item staleness keys on `posted_at`** (script:244–245), which is
   nullable — the `IS NOT NULL` guard is part of the filter, not decoration.
   Prod currently has 0 stale items (verified 2026-07-10); the section will
   render "(none)" — that's correct, not a bug.
8. **Don't import from the script, don't refactor the script.** The script
   self-loads `.env.local` and builds its own client (script:48–58,105–109);
   the repo uses `getSupabaseAdmin()`. They stay parallel implementations —
   the header comments in both should cross-reference.
9. **Audit action names** must differ from the script's `auto-*` names so the
   audit trail distinguishes a human click from a CLI run.
10. **`revalidatePath` from server actions only** — it belongs in
    `actions.ts`, not the repo (repos are also called from scripts/route
    handlers where revalidation is meaningless).

## Acceptance criteria

- [ ] `nvm use 20 && npm run lint && npm run build` pass; `test:admin`,
      `test:monitor`, `test:stack` pass, incl. new `cleanup.test.ts` (with the
      today-is-not-expired pin and a DST-boundary case).
- [ ] `/admin/cleanup` renders all sections; against current prod data the
      gift-card section lists `gc-tcn-jbhifi` and (from 2026-07-11)
      `gc-woolworths-wish`; other actionable sections show "(none)".
- [ ] Apply buttons confirm before running; a rate-limit failure renders
      ActionButton's inline error, not a 500.
- [ ] After an apply: the row leaves the list on refresh, `/admin/audit` shows
      the `cleanup-*` action with actor email, and the public page no longer
      shows the offer (spot-check `/deals`).
- [ ] Bulk "Apply all" writes one audit summary row and tolerates a mid-flight
      no-longer-eligible row without aborting the batch.
- [ ] `npm run cleanup:old-deals` (dry-run) output is byte-identical to before
      (script untouched: `git diff --stat` shows nothing under `scripts/`).
- [ ] "Cleanup" appears in the admin nav and highlights when active.
- [ ] `git diff --stat` touches exactly the five listed files.

## Commit

```
Add /admin/cleanup — reviewed one-click apply for expiry hygiene
```
Gate: lint + build + three suites; only the five files staged. Push to
`origin/main` autonomously after `git pull --rebase`.
