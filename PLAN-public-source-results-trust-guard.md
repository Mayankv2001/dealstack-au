# PLAN-public-source-results-trust-guard — Make search/store source cards obey public trust rules

> **Rank: 2 of 5.** `/cards` uses `fromDbOrDemo`, so static card demos are never served as live fallback when Supabase is configured. But `/search` and `/stores/[slug]` use `lib/repos/sourceResults.ts`, which queries all source tables directly. If any query throws or the DB pool is empty, it falls back to static source results; it also currently lets expired DB rows flow through as "expired" cards instead of hiding them like the public offer repositories do. This is a cross-route trust-boundary gap.

## Goal

Make `searchSourceResults()` and `storeSourceResults()` follow the same public-read contract as the main offer repos:

- Static source results are used only for explicit static/no-Supabase demo mode.
- A configured Supabase project is authoritative: query errors return an empty source-results pool, not static samples.
- Hard-expired offers/signals are filtered out before ranking, not merely demoted.
- Card-offer source results use the same public-ready gate from `PLAN-card-offer-public-readiness-gate.md`.

## Exact Files To Touch

| File | Change |
|---|---|
| `lib/repos/sourceResults.ts` | Refactor DB loading to distinguish demo mode vs configured DB mode; filter expired rows; apply card readiness before mapping cards |
| `lib/sources/searchSources.ts` | Add optional `now` parameter to `rankSourceResults` and `rankSourceResultsForStore` for deterministic tests |
| `tests/stack/sourceResultsTrust.test.ts` | New pure tests for filtering/ranking behaviour |
| `tests/stack/cardResults.test.ts` | Add regression that expired/card-not-ready results do not appear in public source pools after filtering |
| `app/search/page.tsx` | Update stale comment that still says "static/mock pipeline" |
| `app/stores/[slug]/page.tsx` | Update stale comment that still says "static/mock pipeline" |

If `PLAN-card-offer-public-readiness-gate.md` has not shipped yet, do it first. This plan should import its readiness helper rather than duplicating the card rule.

## Implementation Order

1. Read the current flow end to end:
   - `app/search/page.tsx`
   - `app/stores/[slug]/page.tsx`
   - `lib/repos/sourceResults.ts`
   - `lib/sources/searchSources.ts`
   - `lib/offers/expiry.ts`
2. In `lib/sources/searchSources.ts`, add deterministic clocks:
   - `rankSourceResults(results, query, now = new Date())`
   - `rankSourceResultsForStore(results, storeId, now = new Date())`
   - Use the passed `now` everywhere currently using a local `new Date()`.
   - Keep `searchSources()` and `sourceResultsForStore()` signatures unchanged.
3. In `lib/repos/sourceResults.ts`, split the loader decision:
   - `DATA_SOURCE=static` -> return `null` so callers use static source pool.
   - no Supabase client -> return `null` so local/no-env demo still works.
   - configured Supabase -> return an array, even if empty.
   - query error in configured mode -> `console.warn` and return `[]`, not `null`.
4. Filter DB rows before mapping where practical:
   - cashback/gift cards/points/signals: drop rows where `isPastExpiry(expiry_date, todayAU(now))` is true.
   - card offers: map row to `CardOfferSourceInput` only if the card readiness helper says public-ready. If the helper expects camelCase fields, build the minimal object before checking.
5. After mapping, optionally run one final `filterLive`-equivalent pass over `DealSourceResult[]` as belt and braces.
6. Keep the "empty DB pool" behaviour strict:
   - In configured DB mode, zero public source rows means `[]`, so the checked-sources section shows its empty state.
   - Do not resurrect static samples.
7. Add tests using pure helpers/injected rows rather than mocking Supabase:
   - Export a small pure function such as `buildSourceResultPoolFromRows(rows, now)` if needed.
   - Test expired gift card/cashback/signal rows are absent.
   - Test a non-ready card offer is absent.
   - Test an empty configured pool stays empty and does not call static ranking.

## Edge Cases A Weaker Model Would Miss

1. **`null` currently means "use static fallback".** Do not return `null` for configured DB errors or empty DB results after this change. Return `[]`.
2. **Filtering after ranking still leaks content.** `rankResults` only sinks expired items; it does not remove them. The public read guard's contract is "do not render hard-expired offers", so filter before cards are displayed.
3. **Gift-card source results fan out per accepted merchant.** Filter the source row once before `giftCardToResults`; do not filter only one emitted merchant result and leave others alive.
4. **Card offers are merchantless by design.** They should appear in `/search` when the query matches card/provider terms, but never in `/stores/[slug]`. Preserve that by keeping `merchantId: null` in `cardOfferToSourceResult`.
5. **Static manual data intentionally includes expired samples.** Do not alter `lib/sources/manualData.ts`; static mode is allowed to demonstrate expired ranking. This plan hardens configured DB mode.
6. **Query comments matter here.** Both public pages still have stale "static/mock pipeline" comments. Update them so the next agent does not assume the old behaviour.

## Acceptance Criteria

- [ ] In configured Supabase mode, a query error in one source-results table logs a warning and `/search` still renders with zero checked-source results, not static samples.
- [ ] In configured Supabase mode, if all DB source rows are expired or card-not-ready, `/search?q=qantas` and `/stores/myer` show checked-source empty states.
- [ ] In `DATA_SOURCE=static` mode, existing static search/source examples still render.
- [ ] Expired DB rows do not appear in `SourceResultCard` output on `/search` or `/stores/[slug]`.
- [ ] Card offers still appear in `/search` only when public-ready and query-matched; they never appear on store pages.
- [ ] `npm run test:stack`, `npm run test:monitor`, `npm run lint`, and `npm run build` pass.

