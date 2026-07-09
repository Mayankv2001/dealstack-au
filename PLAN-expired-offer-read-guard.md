# PLAN: Read-time guard — never render hard-expired offers on the public site

> **Rank: 2 of 5.**
> Today, a published offer whose `expiry_date` has passed keeps rendering on
> the public site until an admin manually runs `npm run cleanup:old-deals`
> or edits the row. The admin data-quality report treats "Expired but still
> live" as its **highest-severity** flag — i.e. the product's stated intent is
> that expired offers must not be public — but nothing on the read path
> enforces it. This plan adds a small, pure, tested expiry filter to the
> public repository layer so the site self-heals every ISR revalidation,
> while the admin portal continues to see (and flag) the expired rows.

## Context you must load first

- Run `nvm use 20` before any `npm run lint / build / test:*`.
- Read before editing:
  - `lib/supabase/server.ts` — specifically `fromDbOrStatic` and `fromDbOrDemo`
    (their fallback semantics dictate WHERE the filter must sit; see edge case 1)
  - `lib/repos/offers.ts` (all five getters)
  - `lib/repos/weeklyDeals.ts`
  - `scripts/cleanup-old-deals.ts` lines ~84–98 (the AU "today" + `lt` semantics
    you must match exactly)
  - `lib/admin/repos/dashboard.ts` — `DQ_DAY_FMT` (same semantics, second reference)

## Goal

Public read functions (`lib/repos/*`) never return an offer/signal/weekly deal
whose `expiry_date` is strictly before "today" in Australia/Sydney time.
Rows with `expiry_date = null` are evergreen and always pass. Rows expiring
*today* still render (matching the cleanup script's `lt(expiry_date, TODAY)`
convention). Admin repos (`lib/admin/repos/*`) are untouched — admins must
keep seeing expired rows so they can fix them.

## Exact files to touch

| File | Change |
|---|---|
| `lib/offers/expiry.ts` | **New** — pure helpers: `todayAU`, `isPastExpiry`, `filterLive` |
| `lib/repos/offers.ts` | Apply `filterLive` to all five getters |
| `lib/repos/weeklyDeals.ts` | Apply `filterLive` to `getWeeklyDeals` |
| `tests/stack/expiryGuard.test.ts` | **New** — pure-function tests |

Explicitly NOT touched: `lib/repos/stores.ts`, `lib/repos/topDeals.ts`,
`lib/sources/ranking.ts`, `lib/sources/normalise.ts`, anything in
`lib/admin/`, `components/`, or `app/`.

## Step-by-step implementation order

### Step 1 — create `lib/offers/expiry.ts`

```ts
/**
 * Read-time expiry guard for PUBLIC reads.
 *
 * "Expired" means expiry_date is strictly before today's date in
 * Australia/Sydney — the same convention as the cleanup script
 * (scripts/cleanup-old-deals.ts, `lt(expiry_date, TODAY)`) and the admin
 * data-quality report (lib/admin/repos/dashboard.ts DQ_DAY_FMT): an offer
 * remains live ON its expiry day, and a null expiry means evergreen.
 * Dates compare as YYYY-MM-DD strings — never via Date parsing, which is
 * UTC-relative and off by one around AU midnight.
 */

const AU_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** AU-local calendar date as YYYY-MM-DD (en-CA locale formats exactly that). */
export function todayAU(now: Date = new Date()): string {
  return AU_DAY_FMT.format(now);
}

/** True when the date has strictly passed in AU time. Null/undefined → false. */
export function isPastExpiry(
  expiryDate: string | null | undefined,
  today: string
): boolean {
  return expiryDate != null && expiryDate < today;
}

/** Drops hard-expired items; keeps evergreen (null) and today-or-later. */
export function filterLive<T extends { expiryDate: string | null }>(
  items: T[],
  today: string = todayAU()
): T[] {
  return items.filter((item) => !isPastExpiry(item.expiryDate, today));
}
```

### Step 2 — apply in `lib/repos/offers.ts`

For each of the five getters (`getGiftCardOffers`, `getCardOffers`,
`getCashbackOffers`, `getPointsOffers`, `getOzBargainSignals`), wrap the
**result of** the fallback helper — NOT the query callback inside it:

```ts
import { filterLive } from "@/lib/offers/expiry";

export async function getGiftCardOffers(): Promise<GiftCardOffer[]> {
  const rows = await fromDbOrStatic("gift_card_offers", staticGiftCards, async (db) => {
    /* existing body unchanged */
  });
  return filterLive(rows);
}
```

(Converting `return fromDbOrStatic(...)` to `const rows = await ...; return
filterLive(rows);` — the function signatures already return Promises so
callers don't change.)

All five mapped types (`GiftCardOffer`, `CardOffer`, `CashbackOffer`,
`PointsOffer`, `OzBargainSignal`) have `expiryDate: string | null`, so
`filterLive` type-checks against each without adapters.

### Step 3 — apply in `lib/repos/weeklyDeals.ts`

Same wrap for `getWeeklyDeals()`. `WeeklyDeal.expiryDate` is
`string | null` (confirmed in the row mapper).

### Step 4 — tests: `tests/stack/expiryGuard.test.ts`

Pure tests, no DB, run by `npm run test:stack`. Always pass an explicit
`today` — never let a test depend on the real clock. Cover at minimum:

```ts
import { describe, expect, it } from "vitest";
import { filterLive, isPastExpiry, todayAU } from "@/lib/offers/expiry";

describe("isPastExpiry", () => {
  it("null expiry is never expired (evergreen)", () =>
    expect(isPastExpiry(null, "2026-07-07")).toBe(false));
  it("expiry today is still live (matches cleanup lt semantics)", () =>
    expect(isPastExpiry("2026-07-07", "2026-07-07")).toBe(false));
  it("expiry yesterday is expired", () =>
    expect(isPastExpiry("2026-07-06", "2026-07-07")).toBe(true));
  it("expiry tomorrow is live", () =>
    expect(isPastExpiry("2026-07-08", "2026-07-07")).toBe(false));
  it("string compare handles month/year boundaries", () => {
    expect(isPastExpiry("2025-12-31", "2026-01-01")).toBe(true);
    expect(isPastExpiry("2026-10-02", "2026-09-30")).toBe(false);
  });
});

describe("filterLive", () => {
  it("drops only hard-expired items", () => {
    const items = [
      { id: "a", expiryDate: null },
      { id: "b", expiryDate: "2026-07-06" },
      { id: "c", expiryDate: "2026-07-07" },
    ];
    expect(filterLive(items, "2026-07-07").map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("todayAU", () => {
  it("formats as YYYY-MM-DD in Australia/Sydney", () => {
    // 2026-07-07T13:59:00Z is 23:59 AEST on the 7th; 14:01Z rolls to the 8th.
    expect(todayAU(new Date("2026-07-07T13:59:00Z"))).toBe("2026-07-07");
    expect(todayAU(new Date("2026-07-07T14:01:00Z"))).toBe("2026-07-08");
  });
});
```

### Step 5 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:stack     # new tests
npm run test:monitor   # topDeals/search paths consume these repos — must stay green
npm run test:admin
```

Manual check without touching the prod DB: temporarily set an `expiryDate`
in the past on one static offer in `lib/offers/manualOffers.ts`, run
`DATA_SOURCE=static npm run dev`, confirm that offer no longer appears on
`/deals`, then **revert the temporary edit** before committing.

## Edge cases a weaker model would miss

1. **The filter must wrap the fallback helper's RESULT, not sit inside the
   query callback.** `fromDbOrStatic` falls back to static data when the DB
   query returns zero rows. If you filter *inside* the callback and the DB
   holds only expired rows, the callback returns `[]`, the helper falls back,
   and the site serves stale static data as if live — the exact failure mode
   this repo's Phase-1 safety work eliminated for /cards. Filtering the
   awaited result also means the static-fallback rows themselves get
   filtered, which is required: `lib/offers/manualOffers.ts` contains dated
   sample offers that can be past expiry.
2. **Compare dates as strings, in AU time.** `expiry_date` is a Postgres
   `date` arriving as `"YYYY-MM-DD"`. `new Date(expiry) < new Date()` is
   wrong twice over: it parses the expiry as UTC midnight, and "today" in
   UTC differs from Sydney for ~10–11 hours a day. Both existing references
   (`DQ_DAY_FMT` in `dashboard.ts`, `DAY_FMT` in `cleanup-old-deals.ts`) use
   the `en-CA` + `Australia/Sydney` Intl trick; match it exactly.
3. **Expiry day itself is LIVE.** The cleanup script unpublishes with
   `lt("expiry_date", TODAY)` — strictly before. Using `<=` here would make
   the public site hide offers a day earlier than the admin tooling says
   they expire. Keep `<`.
4. **Do NOT filter `lib/repos/stores.ts`.** `stores.expiry_date` is the
   expiry of that store's embedded *discount code*, not of the store. If you
   filter stores, entire store pages (and their `/sitemap.xml` entries)
   vanish. The stack calculator already downgrades/warns on expired codes
   via `expirySoonWarning` and confidence handling — leave stores alone.
5. **Do NOT "clean up" `lib/sources/ranking.ts`.** Search ranking sorts
   expired results last via its own `isExpired`. After this change those
   paths mostly receive pre-filtered input, but ranking also handles
   `expired-unknown` *confidence* (a different concept from a passed date).
   Leave it as a second net.
6. **Signals keep their status untouched.** The cleanup script transitions
   expired signals to `status='expired'` in the DB; this guard only hides
   them at read time in the interim. Do not write anything from `lib/repos/`.
   The public read layer must stay strictly read-only.
7. **`expiryDate` vs `startDate`:** gift cards also carry `startDate`. Do not
   invent a "not started yet" filter — that's a product decision nobody made,
   and upcoming offers are deliberately shown with date ranges in the UI.
8. **The admin dashboard must keep flagging expired-published rows** — that
   report reads via `lib/admin/repos/dashboard.ts` (service role), which this
   plan doesn't touch. If the DQ "Expired but still live" count stops working
   after your change, you edited the wrong layer.
9. **ISR latency is fine.** Public pages have `revalidate = 300`; an offer
   expiring at AU midnight can linger up to ~5 minutes past its first
   post-midnight request. Do not add cache-busting or shrink the ISR window.

## Acceptance criteria

- [ ] `nvm use 20 && npm run lint && npm run build` pass.
- [ ] `npm run test:stack` passes, including the new `expiryGuard` tests; all
      existing tests in `test:monitor` / `test:admin` stay green.
- [ ] All six wrapped getters (`getGiftCardOffers`, `getCardOffers`,
      `getCashbackOffers`, `getPointsOffers`, `getOzBargainSignals`,
      `getWeeklyDeals`) apply `filterLive` to the awaited fallback result —
      verify with `grep -n "filterLive" lib/repos/offers.ts lib/repos/weeklyDeals.ts`
      (6 call sites).
- [ ] `grep -n "filterLive\|isPastExpiry" lib/repos/stores.ts lib/admin -r`
      returns nothing.
- [ ] With `DATA_SOURCE=static` and one static offer's expiry set to
      yesterday (temporary local edit), that offer does not render on
      `/deals`; an offer expiring *today* still renders. Temporary edit
      reverted before commit.
- [ ] The admin dashboard's "Expired but still live" tile still counts
      expired published rows (admin layer unchanged).
- [ ] `git diff --stat` shows exactly: `lib/offers/expiry.ts` (new),
      `lib/repos/offers.ts`, `lib/repos/weeklyDeals.ts`,
      `tests/stack/expiryGuard.test.ts` (new).
