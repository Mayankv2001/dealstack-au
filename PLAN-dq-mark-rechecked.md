# PLAN-dq-mark-rechecked — One-click "Mark re-checked" on data-quality flags

> **STATUS (2026-07-10): SHIPPED** in `1c8a20c`. Kept as historical
> reference — do not re-execute.

> **Rank: 4 of 5 (2026-07-10 backlog; refreshed — this plan was rank 5 of the
> daa2653 backlog and is the only item from it still unshipped; verified no
> `mark-rechecked` code exists via grep + git log 2026-07-10).** The admin
> dashboard's data-quality report flags every published offer / approved signal
> not re-checked in 30+ days (`stale` issue, `lib/admin/repos/dashboard.ts`
> `STALE_DAYS`, line 370). But the only way to clear the flag is a full
> edit-form round-trip: open the row, change nothing, re-save (every repo
> `update…()` sets `last_checked_at = now()` as a side effect). For the weekly
> "I checked the provider's page, the rate is still right" ritual — the core of
> DealStack's "verified data" promise — that's needless friction across five
> content types. Prod today: 1 published gift card is already stale-flagged
> (>30 days unchecked). This plan adds a one-click **Mark re-checked** button on
> each stale-flagged row that bumps ONLY `last_checked_at`, with the full admin
> mutation discipline (requireAdmin → rate limit → audit → revalidate).
> It changes no offer values and publishes nothing.

## Preconditions

- `git pull --rebase`; clean tree; `nvm use 20`; read `AGENTS.md` (Next 16 —
  copy server-action / `revalidatePath` conventions from this repo's own
  actions files, not from memory; `node_modules/next/dist/docs/` if in doubt).
- Read fully before coding:
  - `app/admin/(protected)/card-offers/actions.ts` — the canonical action
    shape: `requireAdmin()` → `checkAdminRateLimit` → repo write → `logAudit`
    → revalidate. Your new action copies this exactly.
  - `components/admin/ActionButton.tsx` — the client button. Its props:
    **`run: () => Promise<AdminActionResult>`** (a bound server action),
    optional `confirm`, `variant`, `size`, `title`; when you omit `onError` it
    renders its own inline error span (standalone mode — exactly right for the
    dashboard, where no parent owns an error line).
  - `lib/admin/repos/dashboard.ts` — the report: `DataQualityFlag` carries
    `type: RecentItemType`, `id`, and `issues: { code, label }[]` (lines
    386–405); `"stale"` is one of `DataQualityIssueCode` (lines 377–383).
  - `app/admin/(protected)/dashboard/page.tsx` — where flags render, and the
    two comments saying the page "has no client island" (lines 64 and 169)
    which you must reword (ActionButton makes it have one).

## Goal

Every dashboard data-quality row whose issues include `stale` (and only those)
shows a "Mark re-checked" button. Clicking it sets that row's `last_checked_at`
to now — nothing else — records an audit entry, consumes one admin rate-limit
unit, and refreshes the dashboard so the flag clears immediately. Rows of types
without a `last_checked_at` column never show the button.

## Non-goals

No public UI change, no migrations, no RLS change, no new columns. No clearing
of `expired` / `missing-source` / `placeholder-copy` flags — those require real
edits (the 5 illustrative card-offer rows must NOT gain a shortcut that hides
their placeholder flag; the button never shows for placeholder-copy-only rows).

## Files to touch

| File | NEW/EDIT | Change |
|---|---|---|
| `lib/admin/repos/recheck.ts` | NEW | Allow-list mapping + the single-column conditional update |
| `app/admin/(protected)/dashboard/actions.ts` | NEW | `markRechecked` server action |
| `app/admin/(protected)/dashboard/page.tsx` | EDIT | Render `ActionButton` on stale-flagged rows; reword the two "no client island" comments |
| `tests/admin/recheck.test.ts` | NEW | Allow-list / validation tests |

No migrations: `last_checked_at` exists on all five mapped tables (001/007) and
is verifiably ABSENT from `stores` and `weekly_deals` (checked against prod
`information_schema.columns` 2026-07-10).

## Step-by-step

### Step 1 — `lib/admin/repos/recheck.ts`

```ts
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { RecentItemType } from "./dashboard";

/** Only these flag types map to a table with a last_checked_at column.
 *  stores and weekly_deals deliberately absent — no such column there. */
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
 *  throws if the id matched no row (see trap 4). */
export async function touchLastCheckedAt(type: RecheckableType, id: string): Promise<void>
```

`touchLastCheckedAt` uses the service-role client:
`db.from(table).update({ last_checked_at: new Date().toISOString() }).eq("id", id).select("id")`
— the trailing `.select("id")` makes PostgREST return the updated rows so a
zero-length result (id deleted between render and click) throws a clear error
instead of silently "succeeding".

### Step 2 — `app/admin/(protected)/dashboard/actions.ts`

`"use server"`, one action:

```ts
export async function markRechecked(type: string, id: string): Promise<AdminActionResult>
```

Body, in order (copy the card-offers action structure):
1. `const { email } = await requireAdmin();`
2. `checkAdminRateLimit({ adminEmail: email })` — return `{ error }` on limit.
3. Validate: `const table = recheckTableFor(type);` — if null, return
   `{ error: "This item type can't be marked re-checked." }`. Also reject
   blank / >200-char ids. **Never interpolate the raw `type` into a table
   name — only the allow-list value is ever used.**
4. `await touchLastCheckedAt(type as RecheckableType, id)` in try/catch →
   friendly `{ error }` on failure (log the real error server-side, matching
   the card-offers `writeFailed` pattern).
5. `logAudit({ actorEmail: email, action: "mark-rechecked", tableName: table,
   rowId: id, diff: { last_checked_at: "now" } })`.
6. `revalidatePath("/admin/dashboard");` then `return { ok: true };`

### Step 3 — dashboard page button

In `app/admin/(protected)/dashboard/page.tsx`, inside the flagged-items
rendering, for each flag where
`flag.issues.some((i) => i.code === "stale") && recheckTableFor(flag.type)`:

```tsx
<ActionButton
  run={markRechecked.bind(null, flag.type, flag.id)}
  size="xs"
  title="Confirms you re-verified this offer at its source just now. Updates only the last-checked time."
>
  Mark re-checked
</ActionButton>
```

`run` takes a **bound** server action — binding in a server component is the
supported serialisation path; an inline arrow here will not serialise (trap 9).
Omit `onError` so ActionButton renders its own error line. Then reword the two
comments (lines 64 and 169) that justify deterministic date formatting via
"this page has no client island": the formatter rationale still holds, but the
page now has one client island (ActionButton) — say that instead of deleting.

### Step 4 — tests (`tests/admin/recheck.test.ts`)

Pure tests over `recheckTableFor` (no DB):
- Each of the five mapped types → its exact table name.
- `"stores"` → null; `"weeklyDeals"` → null; `""`,
  `"admins; drop table"`, `"audit_log"` → null.
- The `satisfies` clause already enforces key-subset at compile time; add a
  one-line type assertion test documenting it.

### Step 5 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:admin && npm run test:monitor && npm run test:stack
```

Manual pass with `npm run dev` (Node-20 PATH prefix; `rm -rf .next/dev` after
any Turbopack panic): prod currently has a stale-flagged gift card, so a real
button should render (if none is visible, temporarily lower `STALE_DAYS` to 0
locally to see buttons — **revert before committing**). Click it, confirm: flag
gone on refresh, `/admin/audit` shows `mark-rechecked` with your admin email,
the offer's other values unchanged, and hammering the button eventually
surfaces the rate-limit message inline (not a crash). **Dev reads the prod DB —
clicking the button performs a real (harmless, timestamp-only) prod write.**

## Edge cases & traps

1. **`stores` and `weekly_deals` have no `last_checked_at` column** (verified
   against prod schema). The allow-list — not the flag's issue codes — is what
   protects the update from a 42703 error; keep both guards: button hidden
   unless the type is mapped AND the issues include `stale`.
2. **The allow-list is also the injection boundary.** `flag.type` arrives back
   from the client as an arbitrary string when the action is invoked; the
   table name must come from the map lookup, never from input.
3. **Bumping `last_checked_at` fires the `updated_at` trigger** (001's
   `set_updated_at()`), so the row jumps to the top of "Recent updates". The
   audit entry's `action: "mark-rechecked"` is what disambiguates it from a
   content edit; don't reuse `action: "update"`.
4. **A PostgREST `update` matching zero rows succeeds silently.** Without
   `.select("id")` + length check, marking a row deleted between render and
   click reports success. Throw, so the action returns its error path.
5. **Only the `stale` issue is clearable by this button.** `expired`,
   `missing-source`, and `placeholder-copy` (the guard shipped in `7d2f293` —
   it currently flags the 5 illustrative card offers) require real edits.
   The issue-code condition in Step 3 is a correctness feature: a row flagged
   ONLY for placeholder copy must show no button; a row flagged stale AND
   placeholder shows the button but keeps its placeholder flag after clicking.
6. **Signals' stale flags apply to APPROVED signals** (that's what the report
   scans, dashboard.ts:534–537). The button must not touch `status` — the
   single-column update guarantees this; resist "while we're here" writes.
7. **Rate limiting is intentional** on this action (30/60s budget,
   `rate-limit.ts:31–33`) — every admin mutation goes through
   requireAdmin → checkAdminRateLimit → logAudit; a timestamp is still a
   mutation.
8. **`revalidatePath("/admin/dashboard")` only.** No public page renders
   `last_checked_at`; without the dashboard revalidation the admin clicks,
   nothing visibly changes, and they click again (burning rate limit).
9. **Bind, don't inline.** `markRechecked.bind(null, flag.type, flag.id)` in
   the server component is the established pattern (ActionButton's own doc
   comment: "Bound server action, e.g. setPublished.bind(null, id, next)").
   ActionButton is the client boundary; the page stays a server component.

## Acceptance criteria

- [ ] A stale-flagged cashback / gift-card / points / card-offer / signal row
      shows the button; stores- and weekly-deal-type flags never do; rows
      flagged only for `expired` / `missing-source` / `placeholder-copy`
      never do.
- [ ] Clicking sets that row's `last_checked_at` to now (verify via the row's
      edit page), changes **no other column**, and after refresh the stale
      flag is gone while any other issues on the row remain.
- [ ] `/admin/audit` shows `action = "mark-rechecked"` with correct table, row
      id, and actor email.
- [ ] A fabricated type (crafted invocation with `type = "audit_log"`) returns
      an error and performs no write (pinned by test at the pure layer).
- [ ] Rate-limit exhaustion renders ActionButton's inline error (no crash).
- [ ] `npm run lint`, `npm run build`, `test:admin`, `test:monitor`,
      `test:stack` all green on Node 20; `git diff --stat` touches only the
      four files listed.

## Commit

```
Add one-click Mark re-checked to dashboard data-quality flags
```
Gate: lint + build + three suites; only the four files staged. Push to
`origin/main` autonomously after `git pull --rebase`.
