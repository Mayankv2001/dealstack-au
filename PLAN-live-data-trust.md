# PLAN-live-data-trust - Make configured Supabase authoritative everywhere

> **Status: Shipped in the 2026-07-10 production-readiness audit.**

> **Rank: 2 of 5. Execute after the homepage approval-boundary plan.**
> Revalidated against `main` at `f65c951`. The source-card path is already safe
> (`fbd570a`) and card offers already use `fromDbOrDemo`, but gift cards,
> cashback, points, approved signals, weekly deals, and stores still use
> `fromDbOrStatic`. In configured production, an empty table, RLS error, or DB
> outage silently resurrects hand-written demo rates and codes. Separately,
> `DealStackCalculator` imports static stores directly, so its store presets are
> demo values even when every surrounding page came from Supabase.

## Goal

Static arrays are allowed only in explicit demo mode:

- `DATA_SOURCE=static`; or
- no public Supabase URL/anon key is configured.

Once Supabase is configured, it is authoritative for every public dataset.
Successful empty reads and failed reads return empty data with a server warning,
never samples. Store discount codes that have passed their AU-local expiry are
suppressed at read time. Calculator store presets use the same repository-loaded
store objects as the page that renders them.

The site must still build, test, and smoke with no secrets in CI.

## Exact Files To Touch

| File | Required change |
|---|---|
| `lib/supabase/server.ts` | Remove `fromDbOrStatic` after migrating its final callers; retain and document `fromDbOrDemo` as the single fallback policy |
| `lib/repos/offers.ts` | Move gift cards, cashback, points, and signals to `fromDbOrDemo`; keep public expiry filtering |
| `lib/repos/weeklyDeals.ts` | Move weekly deals to `fromDbOrDemo` |
| `lib/repos/stores.ts` | Move stores to `fromDbOrDemo`; add a pure read-time guard for expired store discount codes |
| `components/DealStackCalculator.tsx` | Accept `stores: Store[]` as a prop and remove the runtime import of static stores |
| `components/HomeClient.tsx` | Pass its repository-loaded `stores` prop into the calculator |
| `app/stores/[slug]/page.tsx` | Pass loaded stores into the calculator; remove the configured-DB static fallback from `generateStaticParams` and stale comments |
| `app/page.tsx` | Update fallback comments to describe demo mode versus configured DB authority |
| `app/deals/page.tsx` | Update repository contract comment |
| `app/search/page.tsx` | Update store-loading comment |
| `app/stores/page.tsx` | Update store-loading comment |
| `tests/admin/dbFallback.test.ts` | Expand the existing helper contract to all public datasets |
| `tests/stack/storeTrust.test.ts` | New pure tests for expired store-discount suppression |
| `FINAL-LAUNCH-CHECKLIST.md` | Replace manual “make sure fallback is not live” wording with empty/error-state verification |
| `PROJECT_STATE.md` | Record the global data-authority decision and remove stale source-result claims |

Do not touch `lib/repos/sourceResults.ts`; `fbd570a` already gives it the desired
tri-state contract (`null` only in demo mode, `[]` for configured errors/empty).
Do not touch `lib/repos/topDeals.ts` here; Plan 1 owns that publication path.

## Implementation Order

1. In `lib/repos/offers.ts`, change the four remaining public getters from
   `fromDbOrStatic` to `fromDbOrDemo` without moving their query callbacks:
   `getGiftCardOffers`, `getCashbackOffers`, `getPointsOffers`, and
   `getOzBargainSignals`.

   Keep `filterLive(rows)` **outside** the helper. That applies the expiry guard
   to both real DB rows and demo rows. Keep the stricter card readiness filter
   exactly as-is.

2. Make the same helper change in `lib/repos/weeklyDeals.ts`. An empty live
   `weekly_deals` table should hide "This week's picks"; `DealsClient` already
   renders that section only when `weeklyPicks.length > 0`.

3. In `lib/repos/stores.ts`, use `fromDbOrDemo`. Then add and export a pure
   helper with an injected AU date, for example:

   ```ts
   export function guardStoreDiscount(store: Store, today: string): Store
   ```

   If `isPastExpiry(store.expiryDate, today)` is false, return the original
   object. If true, return a copy with:

   - `discountPercent: 0`;
   - `discountCode: "No current public code"`;
   - `expiryDate: null`.

   Apply it to the helper result with `todayAU()`. Do not remove the whole store:
   cashback, gift-card, and points information may still be valid, and the admin
   must retain the original expired fields for correction.

4. After every call site has moved, delete `fromDbOrStatic` from
   `lib/supabase/server.ts`. A dead helper that still promises production
   fallback is an attractive regression path. Update `fromDbOrDemo` docs to say
   it is the public-repository policy, not a card-offer special case.

5. Refactor `DealStackCalculator`:

   - import only the `Store` type from `lib/data.ts`;
   - accept `{ stores: Store[] }`;
   - look up presets from that prop;
   - keep custom numeric input available when `stores` is empty;
   - if the selected store disappears after navigation/revalidation, clearing
     the selection must not reset the user's manually entered numbers.

   Update both render sites: `<DealStackCalculator stores={stores} />` in
   `HomeClient`, and the same on the store detail page. Do not add client-side
   Supabase fetching.

6. Simplify `generateStaticParams()` in `app/stores/[slug]/page.tsx` to return
   whatever `getStores()` returns. In demo/no-env builds that is still the
   static list. In a configured build with an empty/erroring DB it is `[]`, which
   is truthful. Next dynamic params remain enabled by default, so an admin-added
   slug can still render on demand; do not set `dynamicParams = false`.

7. Expand tests:

   - existing `fromDbOrDemo` cases must cover explicit static mode, no client,
     configured rows, configured empty, and configured throw;
   - store discount remains live on its expiry date;
   - it is suppressed the following AU day;
   - null expiry is evergreen;
   - suppressing a code does not zero cashback/gift-card/points fields;
   - malformed dates follow existing lexical date policy and do not introduce
     JavaScript `Date` parsing.

8. Update comments/docs only after behaviour and tests are green. Explicitly
   state that a configured outage produces honest empty states plus `[repos]`
   warnings. Do not describe this as a generic “graceful fallback”.

9. Verify both modes under Node 20:

   ```bash
   # Normal test environment (CI/no Supabase env => demo mode)
   npm run lint
   npm run test:admin
   npm run test:monitor
   npm run test:stack
   npm run build

   # Start the build and run the ordinary smoke suite
   npm run start
   npm run smoke

   git diff --check
   ```

   With configured local Supabase, temporarily force one query to return zero
   and one to throw; confirm the affected sections are empty, not demo-backed.
   Revert the temporary fault before committing (`git grep __none__` and
   `git diff` must prove it is gone).

## Edge Cases A Weaker Model Would Miss

1. **An empty array is authoritative in configured mode.** Do not use
   `rows.length || staticData`. Zero published rows can be an intentional admin
   action and must stay zero.
2. **CI depends on demo mode.** GitHub Actions has no Supabase secrets. Missing
   env must continue returning static arrays so build and smoke remain useful.
3. **`DATA_SOURCE=static` overrides configured env.** This explicit local/demo
   switch remains supported and must be tested.
4. **Filter after helper resolution.** Moving `filterLive` inside only the DB
   callback would let expired demo rows leak in demo mode.
5. **Stores carry actionable codes.** They are not harmless navigation
   skeletons: `StoreCard`, store detail, homepage estimates, and the stack engine
   display `discountCode` and calculate with `discountPercent`. Therefore stores
   must follow the same configured-DB authority rule.
6. **Store expiry is separate from offer-table expiry.** The generic
   `filterLive` cannot drop a store just because its code expired; suppress only
   that discount layer.
7. **The calculator is a client boundary.** Passing serializable store props from
   the server is correct. Importing `lib/repos` into the client component would
   bundle server-only data access and is forbidden.
8. **`generateStaticParams` does not define all future slugs.** With default
   dynamic params, a store added after build still renders. Do not freeze routes
   to the build-time list.
9. **Top Deals currently calls `getStores()`.** Once configured store reads fail
   closed, that repository should hide or return unranked results according to
   its own catch path; it must never resurrect static store names.
10. **Do not conflate this with stale-real caching.** Serving the last known real
    snapshot could be a future availability feature, but hand-authored examples
    are not a cache and cannot be shown as live.
11. **The source-results trust guard is already shipped.** Re-editing its
    loader risks undoing its card readiness and expiry tests.
12. **Store cashback/gift-card summary columns remain a separate modelling
    concern.** This plan removes demo fallback and expired codes; it does not
    redesign schema or synchronize denormalized store summary fields.

## Acceptance Criteria

- [ ] `rg "fromDbOrStatic" lib tests` returns no matches.
- [ ] With Supabase configured, empty and failed reads for stores, offers, and
      weekly deals render empty states and never show static brands/codes/rates.
- [ ] With no Supabase env or `DATA_SOURCE=static`, demo content still renders
      and ordinary smoke tests pass.
- [ ] An expired store code contributes $0 to cards, homepage examples, store
      detail, and calculator presets while the store itself remains available.
- [ ] `DealStackCalculator.tsx` has no value import from `lib/data.ts`; both
      callers pass their repository-loaded stores.
- [ ] Configured DB failures log `[repos] <dataset>: DB read failed; returning no
      rows` without logging secrets or throwing a public 500.
- [ ] No migration, RLS, root layout, global CSS, cron, or monitor-gate change is
      present.
- [ ] Full Node 20 quality gate, smoke test, and `git diff --check` pass.
