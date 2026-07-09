# PLAN: Docs/runbook refresh — bring the ops docs back in sync with shipped code

> **Rank: 4 of 5.**
> This is the "Phase 4" work left over from the 2026-07-02 review. The docs
> are not decoration here: `docs/production-readiness.md` is the literal
> launch/ops runbook for a solo operator, and it currently instructs applying
> **5** migrations when **7** exist (006 `admin_rate_limits`, 007
> `card_offers` — both already applied to prod). README's feature list
> predates `/cards` and the card-offers admin, and claims queue triage is
> strictly "one at a time" when a scoped bulk-ignore now exists. CLAUDE.md's
> command list is missing `test:admin` and `cleanup:old-deals`, so future
> agent sessions won't run them. Every fix below is docs-only — zero code
> changes.

## Context you must load first

Before writing a single line, verify each claim against the code — do not
copy this plan's assertions blindly into prose (they were verified 2026-07-07
and could drift again). Key verification points:

- `ls supabase/migrations/` → 001–007.
- `package.json` scripts → `test:admin`, `cleanup:old-deals` exist.
- `app/admin/(protected)/signals/queue/actions.ts` → `ignoreVisibleItems`
  (scoped bulk ignore, `BULK_IGNORE_MAX = 200`); import remains one-at-a-time.
- `app/admin/login/actions.ts` → magic-link uses `shouldCreateUser: false`
  (new admins need a hand-created Supabase Auth user first).
- `lib/admin/rate-limit.ts` → per-admin mutation throttle exists (migration 006).
- `app/cards/page.tsx`, `app/admin/(protected)/card-offers/` → /cards +
  admin CRUD shipped.
- `scripts/seed.ts` header → confirm the Node-22 requirement before writing it
  (the dashboard "DB data freshness" card says `nvm use 22 && npm run seed`).

House style: Australian spelling (colour, organisation, "manually curated").
Historical review docs get a dated **status note at the top** instead of
in-place rewrites — see the existing notes atop
`docs/bank-card-offer-workflow.md` and `docs/public-ui-expansion-plan.md`
for the exact pattern. Live runbooks (production-readiness.md, README,
CLAUDE.md) are edited in place.

## Goal

Every operational document matches the shipped system: 7 migrations, /cards
surface, card-offers admin, admin rate limiting, bulk-ignore queue tooling,
`test:admin` + `cleanup:old-deals` commands, and the hand-created-Auth-user
requirement for new admins.

## Exact files to touch

| File | Kind | Change |
|---|---|---|
| `docs/production-readiness.md` | live runbook | migrations table + checklist + admin-user note + queue workflow |
| `README.md` | live | features, scripts, queue wording |
| `CLAUDE.md` | live | Commands block + commit checklist |
| `docs/final-review.md` | historical | dated status note at top only |
| `docs/architecture-review.md`, `docs/ozbargain-monitoring.md` | historical | status note ONLY if a factual claim is now wrong |

No code, config, or test files. `app/`, `lib/`, `supabase/` untouched.

## Step-by-step implementation order

### Step 1 — `docs/production-readiness.md`

1. §1 migration table — add two rows after 005:
   | 006 | `supabase/migrations/006_admin_rate_limits.sql` | `admin_rate_limits` (per-admin mutation rate-limit ledger) |
   | 007 | `supabase/migrations/007_card_offers.sql` | `card_offers` (bank/credit-card offers shown on `/cards`) |
2. §2 — after step 2a, add a short note: magic-link sign-in is configured
   with `shouldCreateUser: false`, so a **new** admin's Supabase Auth user
   must be created by hand (Dashboard → Authentication → Add user) *before*
   their first login attempt; the `admins` table row alone is not enough.
3. §9 (queue cleanup workflow) — add the two newer per-item/bulk tools so the
   runbook matches the UI: keyword presets narrow the visible list, and
   **Ignore visible** bulk-ignores only the currently filtered items (capped
   per call; never imports, never publishes).
4. §10 heading/copy mentions the seed script — fine as is; only touch if a
   verification step above contradicts it.
5. §13 pre-launch checklist — change "All 5 migrations applied" to
   "All 7 migrations applied"; add two lines:
   - `[ ] Card offers verified and published at /admin/card-offers`
   - `[ ] /cards renders published offers`

### Step 2 — `README.md`

1. Features → Public Site: add
   `- **Card offers** — compare bank & credit-card sign-up offers at /cards (manually verified, admin-published)`.
2. Features → Admin Portal: add a card-offers CRUD bullet and a rate-limiting
   bullet (per-admin mutation throttle backed by Postgres — describe the
   behaviour, don't hard-code the 30/60s numbers, which may be tuned).
3. Feed-queue bullet: replace "import, ignore, or mark duplicates one at a
   time; no bulk auto-import" with wording that stays true: import is
   one-at-a-time and nothing is ever bulk-imported or auto-published; a
   scoped bulk-**ignore** exists for filtered items.
4. Tests section: add `npm run test:admin   # admin rate-limit & DB-fallback logic`.
5. Seed-data section: add `npm run cleanup:old-deals  # dry-run expiry cleanup (add -- --write to apply)`.

### Step 3 — `CLAUDE.md`

1. Commands block: add
   ```bash
   npm run test:admin     # tests for admin rate-limit/db-fallback logic
   npm run cleanup:old-deals  # dry-run unpublish/expire pass (-- --write to apply)
   ```
2. Commit Checklist: insert `npm run test:admin — if admin action/rate-limit/fallback logic changed`
   after the existing test items.
3. Change nothing else in CLAUDE.md — especially not the Safety Rules section.

### Step 4 — `docs/final-review.md`

Add a dated status blockquote at the very top (mirror the pattern in
`docs/public-ui-expansion-plan.md`), stating roughly:

> **Status note (2026-07-07):** written 2026-06-25, kept as a historical
> record. Since then: migrations 006 (admin rate limits) and 007
> (card_offers) shipped and are applied to production — "Next 5
> Improvements" item 3 (admin action rate limiting) is done; the `/cards`
> public page and card-offers admin CRUD shipped; the test suite has grown
> past the 145 tests counted here; `npm run test:admin` and
> `npm run cleanup:old-deals` now exist. Figures and file lists below
> describe the 2026-06-25 state.

Do not edit the body.

### Step 5 — `docs/architecture-review.md` and `docs/ozbargain-monitoring.md`

Skim each for now-false factual claims (migration counts, "5 migrations",
table lists, missing card_offers). If found, add the same style of dated
status note at the top; if the doc is still accurate, leave it byte-identical.

### Step 6 — verify and commit

```bash
nvm use 20
npm run lint && npm run build   # required by the commit checklist even for docs-only changes
git diff --stat                 # confirm ONLY .md files changed
```

## Edge cases a weaker model would miss

1. **Two docs conventions coexist.** Historical reviews/proposals get a
   status note at the top and their bodies stay untouched (established
   pattern in two docs already); live runbooks are edited in place. Applying
   the wrong convention either falsifies history or leaves the runbook wrong.
2. **Don't hard-code tunable numbers into prose.** Rate-limit
   ceiling/window (`30`/`60s`), `BULK_IGNORE_MAX` (`200`), stale thresholds —
   these are constants that get tuned. Describe behaviour ("a per-admin
   mutation budget"), and name the source file if a reader needs the number.
3. **The "no bulk auto-import" sentence is load-bearing safety language.**
   When rewording the README queue bullet, the invariants that must survive:
   nothing auto-publishes, import is per-item, bulk operations can only
   *ignore*. Do not soften those while making room for `ignoreVisibleItems`.
4. **§13's "All 5 migrations" appears as prose, not only in the table** — a
   naive table-only edit leaves the checklist contradicting the table. Grep
   the whole file for `5 migrations` and `001` … `005` references.
5. **The admin-user note is about Supabase Auth, not the `admins` table.**
   The runbook already says to insert an `admins` row; the *new* pitfall
   (introduced by the Phase-2 `shouldCreateUser: false` hardening) is that a
   magic link silently fails for an email with no pre-existing Auth user.
   Word it as two separate prerequisites.
6. **CLAUDE.md is executable instructions for future agent sessions**, not
   documentation prose — additions must be terse and imperative like the
   existing lines, and nothing in Safety Rules may change.
7. **`.env.example` needs no changes** (verified complete against
   `lib/env.ts` on 2026-07-07) — don't "improve" it.

## Acceptance criteria

- [ ] `grep -n "006\|007" docs/production-readiness.md` shows both migration
      rows; `grep -in "all 7 migrations" docs/production-readiness.md` hits;
      `grep -in "all 5 migrations" docs/production-readiness.md` is empty.
- [ ] production-readiness §2 mentions the hand-created Auth user
      prerequisite; §9 mentions presets + Ignore visible; §13 has the two new
      /cards checklist lines.
- [ ] `grep -n "/cards" README.md` shows the public feature bullet;
      `grep -n "test:admin" README.md CLAUDE.md` hits both;
      `grep -n "cleanup:old-deals" README.md CLAUDE.md` hits both.
- [ ] README's queue bullet mentions bulk ignore while still stating import
      is one-at-a-time and nothing auto-publishes.
- [ ] `docs/final-review.md` line 1–10 contain a dated status note; the rest
      of the file is byte-identical (`git diff` shows only the top insertion).
- [ ] `git diff --stat` lists only `.md` files.
- [ ] `nvm use 20 && npm run lint && npm run build` pass (unchanged code).
