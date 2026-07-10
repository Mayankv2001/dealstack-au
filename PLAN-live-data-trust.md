# PLAN-live-data-trust — Stop serving sample offers when the DB says otherwise

> **Rank: 2 of 5 (2026-07-10 follow-on backlog).** When Supabase is
> configured, four public offer getters still serve **hand-typed sample
> data** whenever the DB returns zero rows *or the read fails*:
> `fromDbOrStatic` (`lib/supabase/server.ts:43-63`) falls back for
> `gift_card_offers`, `cashback_offers`, `points_offers`,
> `ozbargain_signals` (`lib/repos/offers.ts`) and `weekly_deals`
> (`lib/repos/weeklyDeals.ts`); the search pool does the same via
> `loadDbSourceResults` returning `null` on an empty pool or error
> (`lib/repos/sourceResults.ts:339-373`, key line :364). The codebase
> already knows this is wrong: `card_offers` was deliberately moved to
> `fromDbOrDemo` ("zero published rows must render the empty state, not
> resurrect demos … a read error returns no rows — the demo data is never
> served as if it were live", `lib/repos/offers.ts:136-152`), with the
> trust rule pinned in `tests/admin/dbFallback.test.ts`. Concretely today:
> an admin unpublishing the last gift card (one is already expired-flagged —
> PROJECT_STATE §10), an RLS misconfiguration, or a transient Supabase
> outage silently swaps in illustrative rates, expiry dates and promo codes
> on `/`, `/deals`, `/search` and store pages — on a product whose whole
> promise is verified data. FINAL-LAUNCH-CHECKLIST §12's manual "confirm
> pages serve the Supabase dataset, not the static fallback" (:156) exists
> only because this failure is invisible. This plan extends the card-offers
> rule to every public offer dataset: **sample data is demo-mode only.**
> (Verified still-present against `origin/main` @ `4217595`:
> `grep -rn "fromDbOrStatic(" lib/` → offers.ts ×4, weeklyDeals.ts ×1,
> stores.ts ×1.)

## Prerequisites

- `git pull --rebase`; clean tree; `nvm use 20`; read `AGENTS.md` (Next.js
  16 — but this plan touches almost no framework surface; it is data-layer
  + verification).
- Read fully before coding:
  - `lib/supabase/server.ts` — both helpers. `fromDbOrDemo` (:75-95) is the
    behaviour you are adopting; note its `deps` injection for tests.
  - `lib/repos/offers.ts` — all four `fromDbOrStatic` call sites AND the
    `getCardOffers` doc comment (:136-152), which is the pattern and the
    rationale you replicate.
  - `lib/repos/weeklyDeals.ts` — the fifth call site.
  - `lib/repos/sourceResults.ts` — `loadDbSourceResults` (:339-373) and its
    two callers `searchSourceResults` / `storeSourceResults` (:380-395).
    Understand the tri-state: `null` = "defer to static pipeline".
  - `tests/admin/dbFallback.test.ts` — the existing contract tests.
  - `lib/offers/expiry.ts` `filterLive` and the comment at
    `lib/repos/offers.ts:84-86` explaining why it wraps the *result*.

## Goal

With Supabase configured (`hasSupabaseEnv()` true and `DATA_SOURCE` not
`static`), the DB is the single source of truth for every public offer
dataset: zero published rows renders the real empty state, and a failed
read renders empty (with a `console.warn` for Vercel logs) — sample data is
never shown as live. With Supabase env absent or `DATA_SOURCE=static`,
nothing changes: full demo/static behaviour remains (local dev, CI, and the
smoke test all rely on it).

## Exact files to touch

| File | Change |
|---|---|
| `lib/repos/offers.ts` | Swap `fromDbOrStatic` → `fromDbOrDemo` in `getGiftCardOffers`, `getCashbackOffers`, `getPointsOffers`, `getOzBargainSignals`; update module doc |
| `lib/repos/weeklyDeals.ts` | Same swap in `getWeeklyDeals`; update doc |
| `lib/repos/sourceResults.ts` | `loadDbSourceResults`: return `[]` (not `null`) on configured-but-empty and on error; `null` only for demo mode; update both comments |
| `lib/supabase/server.ts` | No logic change — reword `fromDbOrStatic`'s doc: it is now the **stores-only** helper (see edge case 5) |
| `tests/admin/dbFallback.test.ts` | Extend docstring: the rule now covers all public offer datasets, not just `/cards` |
| `FINAL-LAUNCH-CHECKLIST.md` | Reword §12's "confirm not static fallback" bullet (:156): fallback can no longer masquerade; the check is now "confirm expected content exists" |
| `PROJECT_STATE.md` | §4/§7/§11 entries (decision: sample data is demo-mode only, everywhere) |

No migrations. No RLS changes. No new components.

## Step-by-step implementation order

### Step 1 — `lib/repos/offers.ts`

For each of the four getters, change only the helper name (the query
callback and `filterLive` wrapper stay identical):

```ts
const rows = await fromDbOrDemo("gift_card_offers", staticGiftCards, async (db: DbClient) => { … });
return filterLive(rows);
```

Move/adapt the `getCardOffers` rationale comment so the module doc states
the rule once for all five datasets instead of card offers being the
exception. Remove the now-unused `fromDbOrStatic` import.

### Step 2 — `lib/repos/weeklyDeals.ts`

Same one-word swap; update the file comment ("Supabase when configured
(published only); static rows are demo-mode only").

### Step 3 — `lib/repos/sourceResults.ts`

In `loadDbSourceResults`:
- Replace `return results.length > 0 ? results : null;` (:364) with
  `return results;` — a configured-but-empty pool is an empty pool.
- In the `catch`, replace `return null;` with `return [];` and reword the
  warn ("returning no source results — sample data is never a live
  fallback").
- Update the function doc: `null` now means exactly "demo mode — defer to
  the static sample pipeline" (the two early returns at :340-342).

Callers need **no change**: `if (!pool) return searchSources(query);`
already treats `[]` as a real pool (empty array is truthy) and ranks it to
zero results.

### Step 4 — tests

`tests/admin/dbFallback.test.ts`: update the docstring to say the rule now
covers gift cards, cashback, points, signals, weekly deals and the search
pool. The behavioural cases for `fromDbOrDemo` already exist; add none
unless you changed helper logic (you shouldn't have).

### Step 5 — verify empty states in the UI (manual, with a temporary patch)

Demo mode can't show you this (it always has data), so simulate
configured-but-empty locally: with real Supabase env in `.env.local`,
temporarily add `.eq("id", "__none__")` to ONE query at a time (e.g. the
gift-cards query), run `npm run dev`, and check the surfaces that consume
it. **Revert the patch before committing** (`git diff` must not contain
`__none__`). Check:

- `/` — stack calculator still answers (layers just thin out); Today's top
  signals section is a separate path (`lib/repos/topDeals.ts`) and is
  unaffected.
- `/deals` — every filter tab renders sensible empty copy; with
  `weekly_deals` emptied, the "This week's picks" section must hide or
  show its empty state, not a broken grid (see edge case 2).
- `/search?q=myer` — "Checked sources" shows its no-results state.
- `/stores/jb-hi-fi` — offer sections render without crashing.
- `/cards` — already truthful; unchanged.

If any surface renders an awkward hole, the fix is a minimal conditional
(hide the section when its list is empty) in that component — keep to the
existing soft-emerald style, Australian spelling, no redesign.

### Step 6 — full gate

```bash
nvm use 20
npm run lint && npm run build
npm run test:admin && npm run test:monitor && npm run test:stack
npm run smoke   # against a local `npm run start` WITHOUT Supabase env — demo mode must still show content
```

## Edge cases a weaker model would miss

1. **`filterLive` wraps the result, not the query — keep it that way.** The
   comment at `lib/repos/offers.ts:84-86` explains the old reason (expired
   rows must not trigger the zero-rows fallback). The zero-rows fallback is
   gone after this change, but the placement still matters: it also guards
   the *demo* rows in demo mode. Moving it inside the query callback would
   stop filtering demo data.
2. **`weekly_deals` may be thin or empty in production.** The picks feature
   shipped 2026-07-09 (`2835137`) and the section can render *sample*
   picks via the fallback. After this change it will show nothing until the
   admin curates rows in `/admin/weekly-deals`. That is correct behaviour —
   but (a) verify `buildWeeklyPickCards` + `components/DealsClient.tsx`
   hide the section cleanly when given zero deals, and (b) say explicitly
   in the PR description that the owner should either curate real picks or
   expect the section to disappear. `lib/offers/weeklyPicks.ts` already
   drops unresolved component ids silently — mixed DB/static resolution is
   designed for; don't "fix" it.
3. **The error path change is deliberate product policy, not a regression.**
   Before: Supabase outage → sample offers presented as live. After: outage
   → empty sections + `console.warn` in Vercel logs. If a reviewer asks for
   "graceful degradation", the answer is the `getCardOffers` comment: on a
   verified-data product, fabricated data IS the outage. Don't add a
   "stale-but-real cache" here either — that's a different, bigger feature.
4. **Do not touch `lib/repos/topDeals.ts`.** It is already truthful
   (returns `[]` on missing env/static mode/error — see its module doc) and
   it reads admin-reviewed `feed_items` with the service role; changing it
   risks the RLS design documented in its comment.
5. **`getStores` stays on `fromDbOrStatic` — documented decision, not an
   oversight.** The static stores double as the site skeleton (store pages,
   `/stores` index, sitemap, calculator targets); an empty-stores DB state
   rendering a storeless site helps nobody, and prod always has DB store
   rows. Residual risk to note in the PR: static stores carry sample promo
   codes (`MYER10`, `lib/data.ts:81-82`) surfaced as the needs-verification
   "discount" layer — the admin can already edit/zero these via
   `/admin/stores` (StoreForm has the discount fields), so cleaning them is
   a content task for the owner, out of scope here.
6. **Demo mode must keep working — three consumers depend on it:** local
   dev without `.env.local`, the smoke test, and CI (see
   `PLAN-ci-quality-gates.md`, which builds and smokes with no secrets).
   `fromDbOrDemo` returns demo data when env is absent or
   `DATA_SOURCE=static`; do not "simplify" those branches away. After your
   change, `npm run build` with no Supabase env must still succeed
   (verified possible on 2026-07-10).
7. **`loadDbSourceResults` returning `[]` changes `/search` and store-page
   behaviour on outage** (empty "Checked sources" instead of sample pool) —
   that's the intent, but confirm the components render an empty-state
   message rather than `undefined`-mapping. The static pipeline
   (`searchSources`) remains reachable ONLY via `null` = demo mode.
8. **Don't rename the helpers or "clean up" `fromDbOrStatic`.** It still
   has one legitimate caller (stores). Narrow its doc comment instead;
   renaming ripples through tests and stores for zero behaviour gain.
9. **Keep the `console.warn` labels stable** (`[repos] <table>: …`) — they
   are the only way to spot a production fallback in Vercel logs, and
   someone may already grep for them.
10. **`DATA_SOURCE=static` must still force static everywhere** — both
    helpers check it first; verify once manually with the env var set that
    `/deals` shows sample data even with Supabase configured.

## Acceptance criteria

- [ ] `grep -rn "fromDbOrStatic(" lib/` → exactly two hits: the definition
      in `lib/supabase/server.ts` and the `stores` call in
      `lib/repos/stores.ts`.
- [ ] With Supabase configured and a table temporarily emptied (Step 5
      patch): the corresponding public sections render truthful empty
      states — zero sample brands/rates/codes visible. Patch reverted
      (`git grep __none__` → nothing).
- [ ] With Supabase env absent (demo mode): `/`, `/deals`, `/search?q=myer`,
      `/cards` all render sample content exactly as before; `npm run smoke`
      passes against a no-env `npm run start`.
- [ ] With `DATA_SOURCE=static` and Supabase configured: static data is
      served (spot-check `/deals`).
- [ ] Simulated read error (temporarily throw inside one query callback):
      section renders empty, `[repos] …` warn appears in server logs,
      page does not 500. Patch reverted.
- [ ] `npm run lint`, `npm run build`, `test:admin`, `test:monitor`,
      `test:stack` all green on Node 20.
- [ ] `git diff --stat` touches only the seven files listed (plus at most
      one component file if Step 5 required an empty-state fix — name it in
      the PR description).
