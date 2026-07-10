> **STATUS (2026-07-10): SHIPPED in `2835137` — do not re-execute.**
> Kept for reference. Verify with `git log --oneline | grep 2835137`.

# PLAN: Weekly picks on /deals — surface the admin-curated weekly_deals rows

> **Rank: 5 of 5.** The `/admin/weekly-deals` CRUD (title, summary,
> highlight, component ids, citations, expiry, publish toggle) writes rows
> that **never render as content anywhere public**. `/deals` fetches them
> (`app/deals/page.tsx:26-29`) but uses them for exactly one thing: the
> hero's "Week of …" badge label (`components/DealsClient.tsx:488-489`,
> `deriveWeekLabel` :99-112). `docs/source-expansion-strategy.md:128`
> records the same wart from the data side: `component_ids` is "written by
> the admin form but never dereferenced anywhere in the app, so it renders
> nothing". This plan adds a "This week's picks" section to `/deals` that
> renders published weekly deals with the existing `WeeklyDealCard`
> "default" variant — which the component's own doc says exists for
> "curated picks" (`components/WeeklyDealCard.tsx:33-34`) — and resolves
> `componentIds` against the already-loaded offer bundles so each pick
> shows the layers it stacks. An existing admin workflow becomes visible
> product; no new tables, routes, or redesigns.

## Prerequisites

- `nvm use 20`; read `AGENTS.md`.
- Read before coding:
  - `components/DealsClient.tsx` — props (:486-495), section layout
    (hero :631, HotBuys :668, "This week's top stacks" :670-688,
    "Points programme quick guide" :690-738, filter chips :740), and
    `SectionHeading` usage. The new section slots between top stacks and
    the programme guide.
  - `components/WeeklyDealCard.tsx` — `WeeklyDealCardData` (:52-99) and
    the DEFAULT variant (:673-729). Note what default renders: category
    badge, confidence pill, kind icon, title, `subject`, summary, the
    **`highlight` strip** (:708-714), expiry/checked lines, citations. It
    does NOT render `details` — that grid is giftcard-variant only. Use
    `highlight` for the resolved components; do not modify the component.
  - `lib/offers/types.ts` — `WeeklyDeal` (:181-195), `WeeklyHighlight`
    (:30-36).
  - `lib/repos/weeklyDeals.ts` — `getWeeklyDeals()` already returns only
    live (`filterLive`) rows, ordered `week_of` desc; RLS limits the anon
    read to published rows.
  - `lib/offers/manualOffers.ts:937-995` — the four static sample picks and
    their `componentIds` (these are your local test data).
  - `app/admin/(protected)/weekly-deals/actions.ts:108` — VERIFIED: the
    admin actions already `revalidatePath("/deals")`, so published edits
    propagate through ISR without further wiring.

## Goal

`/deals` gets an always-visible (when non-empty) "This week's picks"
section rendering each live, published weekly deal as a compact curated
card: title, our-wording summary, the target store, a bold highlight strip
listing the resolved component layers (e.g. "5% off Ultimate gift cards +
6% ShopBack cashback"), confidence pill, expiry, citations. Component ids
that don't resolve are silently dropped; a pick with zero resolved
components still renders on its title/summary. Zero picks → the section
(header included) does not render at all.

## Exact files to touch

| File | Change |
|---|---|
| `lib/offers/weeklyPicks.ts` | **New** — pure `WeeklyDeal → WeeklyDealCardData` mapper + component resolver |
| `components/DealsClient.tsx` | Build pick cards (useMemo) + render the new section |
| `tests/stack/weeklyPicks.test.ts` | **New** — unit tests for the pure mapper |

No changes to: `WeeklyDealCard.tsx`, `app/deals/page.tsx` (already passes
`weeklyDeals`), the repos, the admin pages, `deriveWeekLabel`, the filter
machinery, `app/layout.tsx`, `app/globals.css`.

## Step-by-step implementation order

### Step 1 — pure mapper: `lib/offers/weeklyPicks.ts` (new)

No React/lucide imports — plain data in, plain data out, so `test:stack`
can cover it without a DOM. Import `WeeklyDealCardData`'s type from the
component with `import type` (type-only imports from a client file into
lib are erased at compile time and safe).

```ts
import type { WeeklyDealCardData } from "@/components/WeeklyDealCard";
import type {
  CashbackOffer, GiftCardOffer, OzBargainSignal, PointsOffer, WeeklyDeal,
} from "./types";
import { isExpiringSoonAU } from "./expiry";

export interface WeeklyPickLookups {
  giftCards: GiftCardOffer[];
  cashback: CashbackOffer[];
  points: PointsOffer[];
  signals: OzBargainSignal[];
  storeNameById: (id: string | null) => string | null;
}
```

Behaviour to implement (export the small pieces so tests can hit them):

1. `highlightMeta(h: WeeklyHighlight)` → `{ kind, tone }`:
   `best-stack → { kind: "guide", tone: "emerald" }`,
   `gift-card → { "gift-card", "violet" }`, `points → { "points", "amber" }`,
   `cashback → { "cashback", "rose" }`, `signal → { "guide", "orange" }`,
   `needs-verification → { "guide", "sky" }`. (`kind` must be a real
   `DealKind` — there is no "signal" kind; guide's Store icon is the
   correct neutral.)
2. `resolveComponentLabels(componentIds, lookups)` → `string[]`, matching
   ids against the three offer pools by `id`:
   - gift card: `` `${discountPercent}% off ${brand} gift cards` `` — but
     when `discountPercent === 0` (points-on-purchase cards like
     `gc-coles-group-bonus-points`) use `` `${brand} gift card bonus` ``.
   - cashback: `` `${ratePercent}% ${provider} cashback` ``.
   - points: `earnRateDisplay` if non-empty else `` `${earnMultiple}x` ``,
     suffixed `` ` (${program})` ``.
   - Unknown ids: skipped, no error, no placeholder.
3. Signal components do NOT become labels (their titles are too long for
   the highlight strip). Instead, a resolved signal contributes
   `{ source: "ozbargain", sourceUrl: signal.sourceUrl }` to the card's
   citations — but ONLY when `signal.isSample` is false (sample source
   URLs are placeholders that must never render as live links; that is the
   same rule `signalToResult` applies in `lib/repos/sourceResults.ts:234-237`).
4. `buildWeeklyPickCard(deal, lookups, now = new Date())` →
   `WeeklyDealCardData`:
   - `variant: "default"`, `category: "This week's pick"`,
     `kind`/`tone` from `highlightMeta(deal.highlight)`,
   - `title`, `summary`, `confidence`, `expiryDate` from the deal,
   - `subject: lookups.storeNameById(deal.merchantId)`,
   - `highlight`: resolved labels joined with `" + "`, or `undefined` when
     none resolve (the strip hides itself),
   - `expiringSoon: isExpiringSoonAU(deal.expiryDate, now)`,
   - `citations: [...deal.citations, ...signalCitations]` deduped by
     `source|sourceUrl`,
   - `lastCheckedAt: null` (weekly_deals has no such column — the
     CheckedLine simply won't render).
5. `buildWeeklyPickCards(deals, lookups, now?)` → sorted `weekOf` desc,
   then title asc, capped at **6**.

### Step 2 — render in `components/DealsClient.tsx`

1. Imports: `buildWeeklyPickCards` from `@/lib/offers/weeklyPicks`
   (`Sparkles` is already imported).
2. Inside the component, after `storeNameById` (:512):

```ts
const weeklyPicks = useMemo(
  () =>
    buildWeeklyPickCards(weeklyDeals, {
      giftCards: giftCardOffers,
      cashback: cashbackOffers,
      points: pointsOffers,
      signals: ozBargainSignals,
      storeNameById: (id) => (id ? storeNameById.get(id) ?? null : null),
    }),
  [weeklyDeals, giftCardOffers, cashbackOffers, pointsOffers, ozBargainSignals, storeNameById]
);
```

   (Match the actual shape of the existing `storeNameById` memo — it is a
   `Map`; adapt if it is already a function.)
3. New section between the top-stacks `</section>` (:688) and the
   programme-guide section (:690), rendered only when
   `weeklyPicks.length > 0`:

```tsx
{weeklyPicks.length > 0 && (
  <section className="mt-8">
    <SectionHeading
      icon={Sparkles}
      iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      title="This week's picks"
      subtitle="Hand-picked stacks and offers, curated after manual review — each pick lists the layers it combines."
    />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {weeklyPicks.map((pick) => (
        <WeeklyDealCard key={pick.title} data={pick} />
      ))}
    </div>
  </section>
)}
```

   Use the deal `id` as the key if you thread it through the card data via
   a wrapper array (`{ id, data }`) — do that rather than keying on title
   (titles can repeat across weeks).

### Step 3 — tests: `tests/stack/weeklyPicks.test.ts` (new)

Pass a fixed `now` (e.g. `new Date("2026-06-20T12:00:00+10:00")`, matching
the suite's pinned clock from PLAN-deterministic-test-clock) — never rely
on the real clock. Cover:

- highlight → kind/tone mapping for all six `WeeklyHighlight` values.
- component resolution: one of each type resolves to the exact expected
  label; an unknown id is dropped silently; a zero-resolution pick yields
  `highlight: undefined`.
- gift-card `discountPercent: 0` uses the "bonus" wording (no "0% off").
- sample signal (`isSample: true`) contributes NO citation; a real signal
  contributes exactly one, and duplicates (same source+url as an existing
  deal citation) are deduped.
- sorting (`weekOf` desc) and the cap at 6.
- `expiringSoon` true/false around the fixed `now`.

### Step 4 — verify

```bash
npm run test:stack && npm run test:monitor && npm run test:admin
npm run lint && npm run build
npm run dev
```

Manual pass on `/deals` (static fallback is fine — the four sample picks
render): section appears between "This week's top stacks" and the
programme guide; each pick shows its resolved layers; hero badge still
says "Week of 22 Jun 2026" (label logic untouched); 375 px viewport has no
horizontal overflow; filter chips still work and do NOT hide/show the
picks section (it sits above the filtered area by design).

## Edge cases a weaker model would miss

1. **Do not put resolved components in `details`** — the `details` grid
   only renders in the `giftcard` variant (:357-371); on the default
   variant it is silently ignored and you'd ship an invisible feature. The
   `highlight` strip (:708-714) is the default variant's designed slot.
2. **Mixed-source resolution is possible and must fail soft.**
   `fromDbOrStatic` falls back **per table**: `weekly_deals` can come from
   the DB while an offer table fell back to static (or vice-versa), so a
   pick's `componentIds` may reference ids from the other pool. The
   resolver drops unresolved ids silently — never render a broken
   reference, never throw. This is why "pick renders on title/summary
   alone" is a required behaviour, not a nice-to-have.
3. **Sample-signal URLs are placeholders.** `OzBargainSignal.isSample`
   exists precisely so fake `sourceUrl`s are never linked as live posts
   (see the same guard in `lib/repos/sourceResults.ts:234-237`). Skip
   their citations entirely.
4. **There is no "signal" `DealKind`** — mapping `highlight: "signal"` to a
   nonexistent kind would make `kindIcons[data.kind]` return `undefined`
   and crash the card render. Map it to `"guide"`.
5. **`weekly_deals` has no `last_checked_at` column**
   (`lib/admin/repos/weeklyDeals.ts:107` says so explicitly) — pass
   `lastCheckedAt: null`; do not invent a freshness stamp from `weekOf`.
6. **Expiry is already handled once** — `getWeeklyDeals()` runs
   `filterLive`, so hard-expired picks never reach the client; your only
   date logic is `expiringSoon`, and it must take an injectable `now` for
   test determinism (the engine's hidden-clock lesson from
   PLAN-deterministic-test-clock applies to NEW code too).
7. **Do not wire picks into the `FilterId` machinery.** The section sits
   with the other always-on editorial sections (top stacks, programme
   guide) above the chips; tagging picks into filters would double-show
   their component offers, which already appear in the filtered sections
   below.
8. **`deriveWeekLabel` keeps consuming the raw `weeklyDeals` prop** — do
   not refactor it to read from the mapped/capped picks list, or an
   expired-but-latest week could shift the label.
9. **Key cards by deal `id`**, not array index or title — admin-created
   picks can share titles across weeks, and index keys break React
   reconciliation when the cap slices the list.
10. **Copy style:** Australian spelling ("Hand-picked", "curated after
    manual review"), soft-emerald accents, and no claim that picks are
    live-fetched — they are admin-curated rows, same trust framing as the
    rest of the page.

## Acceptance criteria

- [ ] Static fallback (`npm run dev`, no Supabase env): `/deals` shows
      "This week's picks" with the four sample picks; `jb-hifi` pick's
      strip reads `5% off Ultimate gift cards` (+ any other resolved
      labels); the Coles pick shows the "bonus" wording, not "0% off".
- [ ] With Supabase: publishing a new weekly deal in `/admin/weekly-deals`
      makes it appear on `/deals` (revalidation already wired);
      unpublishing removes it; a pick referencing a deleted offer id still
      renders without the dropped label.
- [ ] Zero live picks → no section header, no empty-state card (verify by
      filtering the prop to `[]` locally or via a DB state).
- [ ] Hero "Week of …" badge unchanged; filter chips, top stacks,
      programme guide, HotBuys all render exactly as before.
- [ ] Mobile 375 px: no horizontal overflow on `/deals`.
- [ ] New unit tests green; `npm run test:stack`, `test:monitor`,
      `test:admin`, `lint`, `build` all pass (Node 20).
- [ ] `git diff` touches only the three listed files.
