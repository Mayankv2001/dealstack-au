# PLAN: One-click "Mark re-checked" on data-quality flags — close the freshness loop

> **Rank: 5 of 5.** The admin dashboard's data-quality report flags every
> published offer/approved signal not re-checked in 30+ days (`stale` issue,
> `lib/admin/repos/dashboard.ts` `STALE_DAYS`). But the only way to clear the
> flag is a full edit-form round-trip: open the row, change nothing, re-save
> (every repo `update…()` sets `last_checked_at = now()` as a side effect —
> e.g. `lib/admin/repos/cashback.ts:125`, `cardOffers.ts:145`). For the
> weekly "I checked the provider's page, the rate is still right" ritual —
> the core of DealStack's "verified data" promise — that's needless friction
> across five content types. This plan adds a one-click **Mark re-checked**
> button on each stale-flagged row that bumps ONLY `last_checked_at`, with
> the full admin mutation discipline (requireAdmin → rate limit → audit →
> revalidate). It changes no offer values and publishes nothing.

## Prerequisites

- `nvm use 20`; read `AGENTS.md` (Next 16 — server actions/`revalidatePath`
  conventions should be copied from this repo's own actions files, not from
  memory).
- Read fully before coding:
  - `app/admin/(protected)/card-offers/actions.ts` — the canonical action
    shape: `requireAdmin()` → `checkAdminRateLimit` → repo write → `logAudit`
    → revalidate. Your new action copies this exactly.
  - `components/admin/ActionButton.tsx` — the existing client button that
    takes a **bound server action** and handles pending state + returned
    `{ error }`. Reuse it; do not write a new client component.
  - `lib/admin/repos/dashboard.ts` — the report section: flag shape
    (`DataQualityFlag.type` is a `RecentItemType`), and which tables feed it.
  - `app/admin/(protected)/dashboard/page.tsx` — where flags render, and the
    "page has no client island" comments you'll need to amend.

## Goal

Every dashboard data-quality row whose issues include `stale` (and only
those) shows a "Mark re-checked" button. Clicking it sets that row's
`last_checked_at` to now — nothing else — records an audit entry, consumes
one admin rate-limit unit, and refreshes the dashboard so the flag clears
immediately. Rows of types without a `last_checked_at` column never show the
button.

## Exact files to touch

| File | Change |
|---|---|
| `lib/admin/repos/recheck.ts` | **New** — allow-list mapping + the single-column update |
| `app/admin/(protected)/dashboard/actions.ts` | **New** — `markRechecked` server action |
| `app/admin/(protected)/dashboard/page.tsx` | Render `ActionButton` on stale-flagged rows |
| `tests/admin/recheck.test.ts` | **New** — allow-list/validation tests |

No migrations (every relevant table already has `last_checked_at` from 001/
007). No public UI changes. No RLS changes.

## Step-by-step implementation order

### Step 1 — `lib/admin/repos/recheck.ts`

```ts
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { RecentItemType } from "./dashboard";

/** Only these flag types map to a table with a last_checked_at column.
 *  stores and weekly_deals deliberately absent — see their repo comments
 *  (lib/admin/repos/stores.ts, weeklyDeals.ts: "no last_checked_at column"). */
export const RECHECKABLE_TABLES = {
  cashback: "cashback_offers",
  giftCards: "gift_card_offers",
  points: "points_offers",
  cardOffers: "card_offers",
  signals: "ozbargain_signals",
} as const satisfies Partial<Record<RecentItemType, string>>;

export type RecheckableType = keyof typeof RECHECKABLE_TABLES;

/** Pure — exported for tests and for the action's validation. */
export function recheckTableFor(type: string): string | null

/** Bumps last_checked_at to now on exactly one row. Throws on DB error;
 *  throws if the id matched no row (update returns count 0 — see edge case 4). */
export async function touchLastCheckedAt(type: RecheckableType, id: string): Promise<void>
```

`touchLastCheckedAt` uses the service-role client:
`db.from(table).update({ last_checked_at: new Date().toISOString() }).eq("id", id).select("id")`
— the trailing `.select("id")` makes PostgREST return the updated rows so a
zero-length result (id not found / already deleted) can throw a clear error
instead of silently "succeeding".

### Step 2 — `app/admin/(protected)/dashboard/actions.ts`

`"use server"` file, one action, signature matching `ActionButton`'s
expectation (`() => Promise<AdminActionResult>` once bound):

```ts
export async function markRechecked(type: string, id: string): Promise<AdminActionResult>
```

Body, in order (copy the card-offers `setPublished` action structure):
1. `const { email } = await requireAdmin();`
2. `checkAdminRateLimit({ adminEmail: email })` — return `{ error }` on limit.
3. Validate: `const table = recheckTableFor(type);` — if null, return
   `{ error: "This item type can't be marked re-checked." }`. Also reject
   blank/oversized ids (`!id || id.length > 200`). **Never interpolate the
   raw `type` into a table name — only the allow-list value is ever used.**
4. `await touchLastCheckedAt(type as RecheckableType, id)` in try/catch →
   friendly `{ error }` on failure (log the real error server-side, same
   `writeFailed` pattern as card-offers actions).
5. `logAudit({ actorEmail: email, action: "mark-rechecked", tableName: table,
   rowId: id, diff: { last_checked_at: "now" } })`.
6. `revalidatePath("/admin/dashboard");` then `return { ok: true };`

### Step 3 — dashboard page button

In `app/admin/(protected)/dashboard/page.tsx`, inside the flagged-items
rendering, for each flag where
`flag.issues.some((i) => i.code === "stale") && recheckTableFor(flag.type)`:

```tsx
<ActionButton
  action={markRechecked.bind(null, flag.type, flag.id)}
  ...  // match ActionButton's real props — read the component first
>
  Mark re-checked
</ActionButton>
```

Read `ActionButton.tsx` for its actual prop names/variants and follow an
existing usage (grep for `<ActionButton` in `app/admin/`) rather than the
sketch above. Amend the two comments in the dashboard page that say the page
"has no client island" — after this change it has one (the comments justify
the deterministic date formatter; that rationale still holds, so reword, not
delete).

### Step 4 — tests (`tests/admin/recheck.test.ts`)

Pure tests over `recheckTableFor` (no DB):
- Each of the five mapped types → its exact table name.
- `"stores"` → null; `"weeklyDeals"` → null (these have no
  `last_checked_at`); `""`, `"admins; drop table"`, `"audit_log"` → null.
- Type-level: `RECHECKABLE_TABLES` keys are a subset of `RecentItemType`
  (enforced by the `satisfies` — the test just documents it with a
  compile-time assignment).

### Step 5 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:admin && npm run test:monitor && npm run test:stack
```

Manual pass with the dev server (Node-20 PATH prefix per memory): find or
manufacture a stale flag (temporarily lowering `STALE_DAYS` locally to 0 is
the quickest way to see buttons — **revert before committing**), click
Mark re-checked, confirm: flag disappears on refresh, `/admin/audit` shows a
`mark-rechecked` row with your admin email, the offer's values are unchanged,
and clicking many times in a row eventually hits the rate-limit error path
(rendered by ActionButton, not a crash).

## Edge cases a weaker model would miss

1. **`stores` and `weekly_deals` have no `last_checked_at` column** — their
   repos document this explicitly. The allow-list (not the flag's issue
   codes) is what protects the update from a 42703 error; keep both guards:
   button hidden unless the type is mapped AND issue is `stale`.
2. **The allow-list is also the injection boundary.** `flag.type` arrives
   back from the client as an arbitrary string when the action is invoked;
   the table name must come from the map lookup, never from the input. This
   is the same reason the repos hardcode table unions elsewhere
   (`unpublishExpired`'s parameter type in `scripts/cleanup-old-deals.ts`).
3. **Bumping `last_checked_at` fires the `updated_at` trigger** (001 sets
   `set_updated_at()` triggers on these tables), so the row will jump to the
   top of the dashboard's "Recent updates" feed labelled by its publish
   state. That's acceptable and even useful — but the audit entry's
   `action: "mark-rechecked"` is what disambiguates it from a content edit;
   don't reuse `action: "update"`.
4. **A PostgREST `update` matching zero rows succeeds silently.** Without the
   `.select("id")` + length check, marking a row that was deleted between
   render and click reports success and the admin believes it's handled.
   Throw, so the action returns its error path.
5. **Only the `stale` issue is clearable by this button.** `expired`,
   `missing-source`, and `placeholder-copy` (if PLAN-placeholder-copy-guard
   shipped) require real edits — showing the button on those rows would
   invite admins to "clear" problems that remain. The issue-code condition
   in Step 3 is a correctness feature, not styling.
6. **Signals' stale flags apply to APPROVED signals** (that's what the report
   scans). The button on a signal must not touch `status` — a re-check
   confirms the signal, it doesn't re-approve or publish anything. The
   single-column update guarantees this; resist "while we're here" updates.
7. **Rate limiting is intentional on this action.** It's a mutation like any
   other; skipping `checkAdminRateLimit` because "it's just a timestamp"
   breaks the invariant documented in FINAL-LAUNCH-CHECKLIST §6 ("every
   admin mutation goes through requireAdmin → checkAdminRateLimit →
   logAudit").
8. **`revalidatePath("/admin/dashboard")` only.** No public page renders
   `last_checked_at`, so revalidating `/deals` or `/cards` is wasted; and
   without the dashboard revalidation the admin clicks, nothing visibly
   changes, and they click again (burning rate limit).
9. **Bind, don't inline.** `markRechecked.bind(null, flag.type, flag.id)`
   in a server component is the established pattern (`ActionButton` docs
   comment says exactly this). Defining an inline arrow in the RSC and
   passing it down will not serialise.

## Acceptance criteria

- [ ] A stale-flagged cashback/gift-card/points/card-offer/signal row shows
      the button; stores- and weekly-deal-type flags never do; rows flagged
      only for `expired`/`missing-source` never do.
- [ ] Clicking sets that row's `last_checked_at` to now (verify via the row's
      edit page or DB), changes **no other column**, and after refresh the
      stale flag is gone while any other issues on the row remain.
- [ ] `/admin/audit` shows `action = "mark-rechecked"` with the correct
      table, row id, and actor email.
- [ ] The action with a fabricated type (e.g. crafted request with
      `type = "audit_log"`) returns an error and performs no write.
- [ ] Rate-limit exhaustion returns the standard friendly error through
      `ActionButton` (no unhandled exception).
- [ ] Unauthenticated invocation is impossible: the action file starts with
      `requireAdmin()` and lives under `(protected)` — confirm a logged-out
      POST gets the redirect/401 behaviour other admin actions have.
- [ ] `npm run lint`, `npm run build`, `npm run test:admin`,
      `test:monitor`, `test:stack` all green on Node 20; `git diff --stat`
      touches only the four files listed.
