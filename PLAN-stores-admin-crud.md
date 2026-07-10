> **STATUS (2026-07-10): SHIPPED in `3a2282f` — do not re-execute.**
> Kept for reference. Verify with `git log --oneline | grep 3a2282f`.

# PLAN: Stores admin CRUD — unblock the platform's core growth lever

> **Rank: 7 of 10.**
> Stores are the spine of the product — every stack calculation, store page,
> merchant match (`findMerchantIdInText`), and most offers hang off a
> `stores` row — yet stores are the ONE content type with **no admin CRUD**.
> `ls app/admin/(protected)/` shows sections for cashback, gift-cards,
> points, signals, weekly-deals, card-offers… and nothing for stores. Today,
> adding or fixing a store means editing `lib/data.ts` locally and running
> the seed script (which needs Node 22, and whose `--overwrite` mode resets
> rows), with no audit trail. Prod has only 9 stores. This plan adds
> `/admin/stores` as a mechanical clone of the newest section pattern
> (card-offers), with an unpublish-only lifecycle and an immutable id.

## Prerequisites

- Plans 1–5 complete. Plan 1 added a section card/attention row/quick action
  for card offers to the dashboard — you will clone that exact diff shape for
  stores. Plan 5 replaced `LooseDB` with generated types — write inserts/
  updates against the generated `stores` row type (numeric/percent columns,
  `aliases: string[]`, `logo_theme: Json | null`).
- `nvm use 20`; read `AGENTS.md` (Next 16 docs in `node_modules/next/dist/docs/`).
- Read before writing any code — these are your clone sources:
  - `lib/admin/repos/cardOffers.ts` (repo pattern: list/get/insert/update/
    setPublished, slugify, `toRow`, `last_checked_at` stamping — stores have
    no `last_checked_at`; drop that part)
  - `app/admin/(protected)/card-offers/{page.tsx,new/page.tsx,[id]/edit/page.tsx,actions.ts}`
    (actions pattern: `requireAdmin` → `checkAdminRateLimit` → validate →
    repo write → `logAudit` → `revalidatePath` → redirect)
  - `components/admin/CardOfferForm.tsx` and `components/admin/WeeklyDealForm.tsx`
    (the `parseLines` textarea-per-line pattern used for arrays)
  - `supabase/migrations/001_initial_schema.sql` — the `stores` table (the
    authoritative column list) and its RLS policy
  - `lib/repos/stores.ts` (public mapping — field names the form must produce)
  - `components/admin/AdminNav.tsx` (nav registration)
  - `app/admin/(protected)/dashboard/page.tsx` (post-plan-1 state)

## Goal

`/admin/stores`: list (published state, sort order), create, edit, and
publish/unpublish stores through the admin UI with rate limiting, audit
logging, and public-page revalidation. **No delete anywhere.** New stores
appear on the public site (homepage store grid, `/stores/[slug]`, search,
sitemap) without a re-seed.

## Exact files to touch

| File | Change |
|---|---|
| `lib/admin/repos/stores.ts` | **New** — admin repo (service-role) |
| `components/admin/StoreForm.tsx` | **New** — create/edit form |
| `app/admin/(protected)/stores/page.tsx` | **New** — list view |
| `app/admin/(protected)/stores/new/page.tsx` | **New** |
| `app/admin/(protected)/stores/[id]/edit/page.tsx` | **New** |
| `app/admin/(protected)/stores/actions.ts` | **New** — server actions |
| `components/admin/AdminNav.tsx` | Add "Stores" entry |
| `app/admin/(protected)/dashboard/page.tsx` + `lib/admin/repos/dashboard.ts` | Stores section card, attention row, quick action, recent-updates rows |

No migrations (the table, RLS, and `is_published` already exist). No changes
to `lib/repos/stores.ts`, `scripts/seed.ts`, or any public page.

## Step-by-step implementation order

### Step 1 — `lib/admin/repos/stores.ts`

Clone `cardOffers.ts` structurally. The `stores` columns (from migration
001): `id` (text PK), `name`, `category`, `logo`, `logo_path?`, `logo_text?`,
`logo_subtext?`, `logo_theme` (jsonb, nullable), `discount_percent`,
`discount_code`, `expiry_date` (date, nullable), `cashback_percent`,
`cashback_provider` (CHECK: `'ShopBack' | 'TopCashback' | '—'`),
`gift_card_discount_percent`, `gift_card_source`, `points_program`,
`points_rate`, `aliases` (text[]), `is_published` (default true),
`sort_order` (int), timestamps.

Provide: `listStores()` (order by `sort_order` asc, then `name`),
`getStore(id)`, `insertStore(input)`, `updateStore(id, input)`,
`setStorePublished(id, isPublished)`. Two deviations from the card-offers
clone:
- **The id is admin-supplied, not generated.** It is the public URL slug
  (`/stores/[id]`) and the join key offers reference via `merchant_id` /
  `accepted_at_merchant_ids`. Validate `^[a-z0-9-]{2,40}$`; on insert, a
  duplicate-key error must surface as a friendly "A store with this id
  already exists" message, not a 500.
- **No delete function.** Do not export one.

### Step 2 — `components/admin/StoreForm.tsx`

Clone the CardOfferForm layout. Field handling:
- `id`: text input on create; **read-only (rendered, disabled, plus hidden
  submit value or displayed-only)** on edit — see edge case 1.
- Percent fields (`discount_percent`, `cashback_percent`,
  `gift_card_discount_percent`): number inputs, validate `0 ≤ n ≤ 100` in
  the action.
- `cashback_provider`: a `<select>` with exactly `ShopBack`, `TopCashback`,
  `—` (the DB CHECK will reject anything else; NEVER add Cashrewards).
- `aliases`: textarea, one per line, via the existing `parseLines` pattern
  (trim, drop empties, lowercase — check how `findMerchantIdInText` in
  `lib/sources/normalise.ts` matches aliases and normalise consistently).
- `expiry_date`: date input; validate with the existing
  `lib/admin/dateHelpers.ts` helpers (same as other forms).
- `logo_theme`: optional textarea holding raw JSON. In the action: empty →
  `null`; otherwise `JSON.parse` in try/catch → friendly error on invalid
  JSON. Do not attempt a structured editor.
- `is_published` checkbox (note: unlike offers, stores default to
  published=true in the DB; the form default should mirror that), and
  `sort_order` number (default 0).

### Step 3 — `app/admin/(protected)/stores/*` pages + actions

Clone the card-offers section verbatim in structure: list page with
published badge + Manage/Edit + publish-toggle `ActionButton`s; new/edit
pages rendering `StoreForm`; `actions.ts` with create/update/setPublished
actions, each: `requireAdmin()` → `checkAdminRateLimit` → validation →
repo call → `logAudit` (table_name `stores`) → revalidation → redirect or
`AdminActionResult`.

**Revalidation set** for every mutation: `revalidatePath("/")`,
`"/deals"`, `"/search"`, `"/cards"` is NOT needed, and
`` revalidatePath(`/stores/${id}`) ``. Check what the cashback actions
revalidate (store data feeds the same pages) and match-or-exceed that set.
The sitemap reads `getStores()` at request time with ISR — no extra work.

### Step 4 — nav + dashboard

1. `components/admin/AdminNav.tsx`: add "Stores" → `/admin/stores` (match
   the existing ordering logic — put it near the offer sections).
2. `lib/admin/repos/dashboard.ts` + dashboard page: clone plan 1's
   card-offers diff for stores — `PublishCount` in `DashboardCounts`
   (`publishCount(db, "stores")`), a "Stores" section card, an
   "Unpublished stores" attention row, an "Add Store" quick action, and
   recent-updates rows (`select "id, name, is_published, updated_at"`,
   typeLabel "Store", editHref `/admin/stores/${id}/edit`). Extend
   `RecentItemType` with `"stores"`. Keep every `Promise.all` destructure
   positional-aligned.

### Step 5 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:admin && npm run test:monitor && npm run test:stack
```

Dev (`npm run dev`, prod DB — create at most ONE clearly-marked test store
and unpublish it afterwards, or verify with edits to nothing): list shows
the 9 stores; editing a store's `discount_code` updates `/stores/[id]` after
revalidation; audit log rows appear in `/admin/audit`; rate limit returns
the friendly message when hammered.

## Edge cases a weaker model would miss

1. **The store id must be immutable after creation.** It is simultaneously
   the public URL, the FK-in-spirit for `cashback_offers.merchant_id`,
   `points_offers.merchant_id`, `ozbargain_signals.merchant_id`, and a
   member of `gift_card_offers.accepted_at_merchant_ids` arrays. An id
   rename orphans all of them silently (no real FKs on the array column).
   The edit form must not submit an id change, and `updateStore` must not
   include `id` in its update payload.
2. **No delete — not even soft-delete beyond unpublish.** Offers and
   approved signals referencing the store would dangle; the project rule is
   unpublish-not-delete everywhere else, and the cleanup script's philosophy
   ("never deletes") applies. Unpublish is the whole lifecycle.
3. **Unpublishing a store does not unpublish its offers.** RLS hides the
   store row from anon reads, so `/stores/[slug]` will 404 via the page's
   existing `notFound()` (line ~114), but its cashback/points offers keep
   rendering wherever they don't join through `stores`. Surface this in the
   UI copy next to the unpublish button ("Hides the store page and store
   grid entry; offers referencing this store remain published — unpublish
   them separately.").
4. **`stores` has no `last_checked_at`** — the card-offers repo stamps it on
   every save; stripping that line matters because with generated types
   (plan 5) the insert would not compile, and with loose types it would
   silently 500 at runtime.
5. **Percent columns arrive back as strings.** Public reads coerce with
   `toNumber` — your form defaults on the edit page must handle
   string-or-number when pre-filling values (mirror how CashbackForm
   pre-fills `rate_percent`).
6. **`aliases` normalisation matters for matching.** The queue's
   `inferMerchantId` and search matching use these strings; check
   `findMerchantIdInText` in `lib/sources/normalise.ts` and store aliases in
   whatever case/shape it expects (verify: the existing seed data is the
   reference).
7. **Seed interplay:** `npm run seed` is insert-only by default, so
   admin-edited stores survive re-seeds — but `--overwrite` resets any store
   whose id exists in `lib/data.ts` static data. Add one sentence to the
   store list page (muted footer text) noting that seeded store ids are
   reset by `seed --overwrite`.
8. **New stores appear via ISR without `generateStaticParams` changes** —
   `dynamicParams` defaults to true, so an unknown-at-build slug renders on
   demand and is cached. Do not "fix" `generateStaticParams`; verify in the
   Next 16 docs if unsure.
9. **`logo_theme` is display-critical jsonb.** Invalid JSON must be rejected
   in the action (friendly error), and `null` must remain a legal value —
   the store card renderer handles missing themes (it did for seed data);
   never write `"{}"` as a string.
10. **Homepage store grid comes through `getStores()`** which falls back to
    static data when the DB read fails or returns zero rows — if you test
    with all stores unpublished (don't), the public site would resurrect
    static stores. Not a bug to fix here; just don't leave prod in that
    state.

## Acceptance criteria

- [ ] `/admin/stores` lists all stores with published badges and sort order;
      Stores appears in the admin nav.
- [ ] Create → new store visible at `/stores/<id>` (after revalidation) and
      in the homepage grid; audit row logged; rate limit enforced.
- [ ] Edit → cannot change id (form-level and payload-level); changes land
      and public pages revalidate.
- [ ] Publish toggle works both ways with the offers-stay-published caveat
      shown; unpublished store's public page 404s.
- [ ] Invalid inputs (bad id chars, duplicate id, percent >100, invalid
      logo_theme JSON, invalid expiry date) return friendly errors, never a
      500.
- [ ] Dashboard shows Stores counts / attention / quick action / recent
      updates; no `Promise.all` misalignment (spot-check numbers against
      SQL counts).
- [ ] No delete path exists anywhere (`grep -rn "delete" app/admin/\(protected\)/stores lib/admin/repos/stores.ts` shows none).
- [ ] `nvm use 20 && npm run lint && npm run build` and all three test
      suites pass.
