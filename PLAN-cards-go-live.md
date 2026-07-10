> **STATUS (2026-07-10): PARTIALLY SHIPPED — do not re-run Steps 1–6.** Admin
> wiring shipped in `2f0a9fb`; all 5 rows were published by an admin on
> 2026-07-08. **Remaining is Step 7 done PROPERLY** — it was performed but
> without the verification it demands: prod-verified 2026-07-10, all 5
> published rows still carry "Illustrative" copy, `confidence =
> 'needs-verification'`, and a null `expiry_date`. The remaining work is to
> verify each offer against its issuer source, fix the real figures, set a
> real expiry, and flip confidence to `confirmed` — not to redo the plan.

# PLAN: Get /cards live — admin coverage + publish workflow for card_offers

> **Rank: 1 of 5 (do this first).**
> The public `/cards` page is linked from the header of every public page and
> from the sitemap, but it renders an **empty state in production**: the
> `card_offers` table has 5 rows and **0 published** (verified against prod
> 2026-07-07). Meanwhile the admin dashboard, data-quality report, and cleanup
> script know nothing about `card_offers`, so the drafts are invisible to the
> normal review workflow. This plan wires `card_offers` into every admin
> operational surface (this is the "Phase 5" work from the 2026-07-02 review),
> then hands the admin a precise verify-and-publish checklist.

## Context you must load first

- Run `nvm use 20` before any `npm run lint / build / test:*` (the shell
  defaults to an old Node).
- Read `AGENTS.md`: this repo uses Next.js 16 with breaking changes — read the
  relevant guide in `node_modules/next/dist/docs/` before editing any
  `app/` file.
- Read these files fully before editing (they are the patterns you clone):
  - `lib/admin/repos/dashboard.ts` (counts, recent updates, data-quality report)
  - `app/admin/(protected)/dashboard/page.tsx` (how counts/flags render)
  - `lib/admin/repos/cardOffers.ts` (the card-offers admin repo — read-only here)
  - `scripts/cleanup-old-deals.ts` (the cleanup script)
  - `supabase/migrations/007_card_offers.sql` (the REAL schema — see edge cases)

## Goal

1. `card_offers` appears in: dashboard Overview counts, "Needs attention",
   Quick actions, Recent updates, the Data quality report, and the
   `cleanup:old-deals` script — mirroring exactly how the other four offer
   tables are handled.
2. The admin (the user) gets a step-by-step checklist to verify the 5 draft
   rows and publish real offers, after which `https://<site>/cards` shows
   live content.

**No schema changes. No new migrations. No changes to `lib/repos/` (public
read layer), `app/cards/page.tsx`, or `components/CardsClient.tsx`.**

## Exact files to touch

| File | Change |
|---|---|
| `lib/admin/repos/dashboard.ts` | Add card_offers to counts, recent updates, DQ report |
| `app/admin/(protected)/dashboard/page.tsx` | Render the new count card, attention row, quick action |
| `scripts/cleanup-old-deals.ts` | Include card_offers in unpublish-expired + no-expiry report |

Nothing else.

## Step-by-step implementation order

### Step 1 — `lib/admin/repos/dashboard.ts`: counts

1. Add `cardOffers: PublishCount;` to the `DashboardCounts` interface.
2. In `getDashboardCounts()`, add `publishCount(db, "card_offers")` to the
   `Promise.all` array and destructure it (keep destructure order aligned with
   the array order — this is positional).
3. Return it as `cardOffers`.

### Step 2 — `lib/admin/repos/dashboard.ts`: recent updates

1. Extend the `RecentItemType` union with `"cardOffers"`.
2. Add an interface next to the others:
   ```ts
   interface CardOfferRecentRow {
     id: string;
     provider: string;
     card_name: string;
     is_published: boolean;
     updated_at: string;
   }
   ```
3. In `getRecentUpdates()`, add to the `Promise.all`:
   ```ts
   queryRecent<CardOfferRecentRow>(
     db,
     "card_offers",
     "id, provider, card_name, is_published, updated_at",
     limit
   ),
   ```
4. Map it into `items` following the giftCards pattern:
   - `type: "cardOffers" as const`
   - `typeLabel: "Card offer"`
   - `title: \`${r.provider} · ${r.card_name}\``
   - `...publishStatus(r.is_published)`
   - `editHref: \`/admin/card-offers/${r.id}/edit\`` (route exists:
     `app/admin/(protected)/card-offers/[id]/edit/page.tsx`)

### Step 3 — `lib/admin/repos/dashboard.ts`: data-quality report

1. Add an interface:
   ```ts
   interface CardOfferDqRow {
     id: string;
     provider: string;
     card_name: string;
     expiry_date: string | null;
     source_url: string;
     last_checked_at: string | null;
   }
   ```
2. In `getDataQualityReport()`, add to the `Promise.all`:
   ```ts
   db
     .from("card_offers")
     .select("id, provider, card_name, expiry_date, source_url, last_checked_at")
     .eq("is_published", true),
   ```
   and include the new result in the `for (const res of [...])` error-check loop.
3. Classify each row with the existing `consider()` helper. **Critical:**
   `consider()` checks sources via `hasSourceUrl(citations)`, but `card_offers`
   has a plain `source_url` text column, NOT a `citations` jsonb column (see
   edge cases). Synthesize the citations shape so `hasSourceUrl` works
   unmodified:
   ```ts
   for (const r of cardOffers.data as unknown as CardOfferDqRow[]) {
     consider({
       type: "cardOffers",
       typeLabel: "Card offer",
       id: r.id,
       title: `${r.provider} · ${r.card_name}`,
       editHref: `/admin/card-offers/${r.id}/edit`,
       expiryDate: r.expiry_date,
       // card_offers stores a single source_url string; adapt it to the
       // citations shape hasSourceUrl() expects.
       citations:
         typeof r.source_url === "string" && r.source_url.trim() !== ""
           ? [{ sourceUrl: r.source_url }]
           : [],
       lastChecked: r.last_checked_at,
       checkSource: true,
       checkMissingExpiry: true,
     });
   }
   ```
4. Do NOT add a new `DataQualityIssueCode` — the existing codes (`expired`,
   `missing-source`, `stale`, `missing-expiry`) all apply to card offers as-is,
   so `DQ_ISSUE_INFO` / `DQ_TILE_ORDER` in the dashboard page need no changes.

### Step 4 — `app/admin/(protected)/dashboard/page.tsx`

1. In the `sections` array, add after "Gift Cards":
   ```ts
   {
     title: "Card Offers",
     description: "Bank & credit-card sign-up offers shown on /cards.",
     href: "/admin/card-offers",
     total: counts.cardOffers.total,
     stats: [
       { label: "Published", value: counts.cardOffers.published },
       { label: "Draft", value: counts.cardOffers.unpublished },
     ],
   },
   ```
2. In the `attention` array, add:
   ```ts
   {
     label: "Unpublished card offers",
     value: counts.cardOffers.unpublished,
     href: "/admin/card-offers",
   },
   ```
3. In `quickActions`, add `{ label: "Add Card Offer", href: "/admin/card-offers/new" }`.
4. No other rendering changes are needed — the flags list and recent-updates
   table are fully data-driven (`typeLabel` comes from the repo, there is no
   exhaustive `Record<RecentItemType, …>` map in the page).

### Step 5 — `scripts/cleanup-old-deals.ts`

1. Extend the table-name union in `unpublishExpired()`'s signature to include
   `"card_offers"` (TypeScript will refuse to compile until you do — that
   union is the safety guard).
2. In `main()`, after the `points_offers` call, add:
   ```ts
   await unpublishExpired("card_offers", (r) =>
     `${String(r.provider ?? "")} · ${String(r.card_name ?? r.id)}`
   );
   ```
3. Extend `flagPublishedNoExpiry()`'s union the same way and add:
   ```ts
   await flagPublishedNoExpiry("card_offers", (r) =>
     `${String(r.provider ?? "")} · ${String(r.card_name ?? r.id)}`
   );
   ```
4. Keep the script's dry-run-by-default behaviour untouched.

### Step 6 — verify (commands)

```bash
nvm use 20
npm run lint
npm run build
npm run test:admin
npm run test:monitor
npm run test:stack
npm run cleanup:old-deals        # dry-run only — must now print card_offers sections
```

Then `npm run dev`, open `/admin/dashboard`, and confirm the Card Offers
overview card, the "Unpublished card offers" attention row, and the quick
action render (dev reads the prod DB, so expect total 5 / published 0).

### Step 7 — manual publish checklist (for the admin — do NOT automate)

This part is for the human admin. Publishing money-related offers requires
admin review per the project safety rules; do not publish via SQL or scripts.

For each of the 5 drafts at `/admin/card-offers`:
1. Open the row's `source_url` (the issuer's own public page).
2. If the offer is real and current: correct every figure (bonus points,
   minimum spend, spend window, annual fee, expiry), set confidence to
   `confirmed`, save (saving auto-stamps `last_checked_at`), then Publish
   from the list view.
3. If the offer no longer exists: either edit the row to a current real offer
   from that issuer, or leave it unpublished.
4. Publishing through the admin UI matters: the server action writes the
   audit log and revalidates `/cards`. A raw SQL `UPDATE` would do neither.
5. After publishing, load `/cards` on production — content appears immediately
   (the action revalidates) or within 5 minutes at worst (ISR `revalidate = 300`).

## Edge cases a weaker model would miss

1. **`card_offers` has `source_url` (text), not `citations` (jsonb).** The
   original design doc (`docs/bank-card-offer-workflow.md`) shows a `citations`
   column, but the doc's own status note says the built schema differs —
   `supabase/migrations/007_card_offers.sql` is the source of truth. If you
   pass `r.citations` (undefined) to `consider()`, every published card offer
   is flagged "missing source" even when `source_url` is set. Use the
   synthesized-citations adapter shown in Step 3.
2. **Do not "fix" the empty /cards page by re-adding a static fallback.**
   `getCardOffers()` deliberately uses `fromDbOrDemo` (not `fromDbOrStatic`):
   when Supabase is configured, zero published rows must render the empty
   state and the hand-typed demo rows in `lib/offers/manualOffers.ts` must
   never be served as if live. That was a production-safety fix (commit
   `4bdf0c9`). The fix for an empty page is publishing real rows, never code.
3. **The `Promise.all` destructures in `dashboard.ts` are positional.** Adding
   the card-offers query anywhere except the matching position in the
   destructure silently swaps counts between sections. Keep array order and
   destructure order in lockstep, and include the new DQ result in the
   error-check loop.
4. **`consider()` only lists `missing-expiry` when the row is already flagged
   for something else** — that is intentional (low severity, counted not
   listed). Don't "improve" it.
5. **The 5 prod rows are demo seeds with illustrative figures** (Amex / NAB /
   CBA / Westpac / ANZ, commit `d00c3fb`). They MUST NOT be published as-is;
   the human verify step is not optional.
6. **Dev reads the production database** (there is no separate staging DB).
   Do not create/edit/publish rows while testing — verifying that the
   dashboard *renders* the counts is enough. Never test the DQ "expired" flag
   by publishing an expired row in prod.
7. **Weekly-deals-style checks don't apply**: card offers have no `week_of`;
   they follow the cashback/gift-card DQ pattern (expired / missing-source /
   stale / missing-expiry), not `stale-week-of`.
8. **`cleanup-old-deals.ts` union types**: `unpublishExpired` and
   `flagPublishedNoExpiry` take literal-union table names. Extending the
   union is required or the file won't compile — that is by design.

## Acceptance criteria

- [ ] `nvm use 20 && npm run lint && npm run build` pass with zero warnings/errors.
- [ ] `npm run test:admin`, `npm run test:monitor`, `npm run test:stack` all pass.
- [ ] `/admin/dashboard` shows a "Card Offers" overview card whose numbers
      match `select count(*) …` for `card_offers` (currently 5 total / 0
      published in prod).
- [ ] "Needs attention" lists "Unpublished card offers" with the correct count
      and links to `/admin/card-offers`.
- [ ] Quick actions includes "Add Card Offer" → `/admin/card-offers/new`.
- [ ] Editing any card offer makes it appear in "Recent updates" with type
      label "Card offer" and a working Edit link.
- [ ] `npm run cleanup:old-deals` (dry-run) prints a
      `card_offers: published but expired → unpublish` section and a
      published-no-expiry report section, and applies nothing.
- [ ] The Data quality card renders without error; a published card offer with
      empty `source_url` would be flagged "Missing source URL" (verify by code
      review of the adapter, not by mutating prod).
- [ ] `git diff --stat` touches exactly the 3 files listed (plus nothing in
      `lib/repos/`, `app/cards/`, `components/`, or `supabase/`).
- [ ] (Human step, after admin publishes verified offers) `/cards` in
      production shows the published offers with confidence badges.
