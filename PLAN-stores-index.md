> **STATUS (2026-07-10): SHIPPED in `aff00df` — do not re-execute.**
> Kept for reference. Verify with `git log --oneline | grep aff00df`.

# PLAN: `/stores` index — give the site's SEO backbone a public hub page

> **Rank: 4 of 5.** Store pages (`/stores/[slug]`) are DealStack's strongest
> SEO surface — they're in the sitemap, they carry breadcrumb JSON-LD and
> per-store OG images — but there is **no index page**: `/stores` 404s
> (FINAL-LAUNCH-CHECKLIST.md §7 documents "no `/stores` index (404 by design;
> nothing links to it)"). Users can only reach store pages via search or
> homepage tiles, and crawlers have no hub aggregating the internal links.
> This plan adds an additive `/stores` directory page reusing the existing
> `StoreCard` grid (the exact pattern `/search` already renders for "browse
> all stores"), adds it to the sitemap and the per-page nav rows, and updates
> the docs that assert the 404. No redesign of anything existing.

## Prerequisites

- `nvm use 20`; read `AGENTS.md` — **this is Next.js 16 with breaking
  changes**; check `node_modules/next/dist/docs/` for App Router
  page/metadata conventions before writing the page. Follow the repo's own
  live examples over training-data habits (note: in this codebase `params`
  and `searchParams` are `Promise`s that must be awaited).
- Read fully before coding:
  - `app/search/page.tsx` — the template for this page: header/nav markup,
    ISR comment style, the `StoreCard` grid classes, empty-state Card.
  - `components/StoreCard.tsx` — props (`store`, `variant`); the "detailed"
    default is what `/search` uses.
  - `lib/repos/stores.ts` + `lib/supabase/server.ts` (`fromDbOrStatic`) —
    `getStores()` already returns published rows (anon client + RLS) sorted
    by `sort_order`, with static fallback. **No new data access is needed.**
  - `app/sitemap.ts` — where `/stores` gets added.
  - `app/stores/[slug]/page.tsx` — confirms the index route coexists with the
    dynamic segment, and shows the store-page nav row you'll extend.

## Goal

`https://<site>/stores` renders a directory of all published stores, grouped
by `store.category`, using the existing `StoreCard` (detailed variant), with
the standard sticky header/nav, metadata title, ISR `revalidate = 300`, and a
link into `/search` for filtering. Every public page's nav row gains a
"Stores" link. The sitemap includes `/stores`. Docs stop saying the index
404s by design.

## Exact files to touch

| File | Change |
|---|---|
| `app/stores/page.tsx` | **New** — the index page (server component, no client island) |
| `app/sitemap.ts` | Add `"/stores"` to `staticRoutes` |
| `app/search/page.tsx` | Nav row: add Stores button |
| `app/stores/[slug]/page.tsx` | Nav row: add Stores button (also serves as "back to all stores") |
| `app/not-found.tsx` | Nav links: add Stores |
| `app/resources/page.tsx` | Nav row (~line 272 area): add Stores |
| `components/DealsClient.tsx` | Nav row (~line 627 area): add Stores |
| `components/HomeClient.tsx` | Nav row: add Stores |
| `components/CardsClient.tsx` | Nav row: add Stores (check it has one — pattern-match its Deals/Resources buttons) |
| `FINAL-LAUNCH-CHECKLIST.md` | §7: replace the "no /stores index" note with a 200 check |
| `docs/*` / `README.md` | `grep -rn "stores index\|404 by design" docs README.md` — update any hit |

Explicitly NOT touched: `app/layout.tsx`, `app/globals.css` (hard rules), any
existing page's layout/design beyond the one added nav `<Button>`.

## Step-by-step implementation order

### Step 1 — `app/stores/page.tsx`

Skeleton (mirror `/search`'s structure and idioms exactly — same imports,
same header markup, same wrapper classes `min-h-screen bg-emerald-500/[0.04]`,
same `mx-auto max-w-6xl` main):

```tsx
export const revalidate = 300;   // same ISR comment style as /search

export const metadata: Metadata = {
  title: "All stores — DealStack AU",
  description: "Every retailer DealStack tracks for stackable savings — cashback, gift cards, points and codes.",
};

export default async function StoresIndexPage() {
  const stores = await getStores();
  // group by category, preserving the sort_order-driven order within groups
  ...
}
```

Content, top to bottom:
1. Sticky header — copy `/search`'s header block verbatim, with nav buttons
   Deals / Cards / Resources / Home (this page's own "Stores" is omitted or
   non-link, matching how other pages don't self-link).
2. `<h1>` "All stores" + a muted count line
   (`${stores.length} stores with stackable savings` — reuse the singular/
   plural pattern from `/search`).
3. A `SearchBar` (`defaultValue=""`) — it already routes to `/search?q=…`,
   giving filtering for free; check `components/SearchBar.tsx` props before
   assuming.
4. Category sections: group `stores` by `store.category` with a `Map` (Maps
   preserve insertion order, so category order follows the first store's
   `sort_order`). For each: an `<h2>` (category name, capitalise via CSS
   `capitalize` if values are lowercase — check actual values in
   `lib/data.ts` first) and the `/search` grid:
   `grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4`, rendering
   `<StoreCard key={store.id} store={store} />`.
5. Empty state: if `stores.length === 0`, render the `/search`-style empty
   Card rather than a blank page (can only happen if both DB and static
   fallback are empty, but the page must not render a bare heading).
6. Australian spelling in all copy ("favourite", "organisation" — and AUD
   formatting is already inside `StoreCard`).

### Step 2 — sitemap

Add `"/stores"` to the `staticRoutes` array in `app/sitemap.ts` (one line,
between `"/search"` and `"/cards"` or wherever — order is cosmetic).

### Step 3 — nav rows

In each file listed above, find the existing header nav cluster (the
`<Button asChild size="sm" variant="ghost"><Link href="/deals">Deals</Link>`
row — `grep -n 'href="/cards"'` lands you on it in every file) and add:

```tsx
<Button asChild size="sm" variant="ghost">
  <Link href="/stores">Stores</Link>
</Button>
```

placed consistently (recommend: after "Deals", before "Cards") in ALL files
so the nav reads identically across pages. In `app/not-found.tsx` follow its
existing plainer link markup instead of inventing a Button.

### Step 4 — docs

- FINAL-LAUNCH-CHECKLIST.md §7: change the `/stores/[slug]` bullet's
  parenthetical to check `/stores` returns 200 with the directory.
- Fix any other doc asserting the 404-by-design (grep per the table above).
- If PLAN-route-smoke-tests.md has shipped, add
  `{ path: "/stores", marker: "All stores" }` to its `PUBLIC_ROUTES` table.

### Step 5 — verify

```bash
nvm use 20
npm run lint && npm run build
```

`npm run build` matters doubly here: it statically renders the new page and
will fail on any Next 16 API misuse. Then run the dev server (memory: launch
via the Node-20 PATH prefix or Turbopack panics) and verify in the browser
preview: `/stores` renders grouped cards; every card links to a working
`/stores/<id>`; nav from `/`, `/deals`, `/cards`, `/search`, `/resources`
reaches `/stores`; mobile 375px has no horizontal overflow; `/sitemap.xml`
includes `/stores`. No test suites are affected (pure UI addition), but run
`npm run test:stack` anyway since `StoreCard` imports `calculateStack`.

## Edge cases a weaker model would miss

1. **Do not write a new data path.** `getStores()` already handles
   Supabase-vs-static fallback, RLS-published filtering, and `sort_order`.
   Adding a `.eq("is_published", true)` filter or a new repo function is
   wrong twice: the anon client's RLS already filters, and the static
   fallback array has no such column semantics.
2. **The index route and the dynamic segment coexist** —
   `app/stores/page.tsx` next to `app/stores/[slug]/page.tsx` is standard
   App Router. But `generateStaticParams` in the slug page means store ids
   are prerendered; nothing there needs changing. Don't move or rename the
   slug directory.
3. **`params`/`searchParams` are Promises in this codebase's Next 16** —
   this page needs neither, so don't add them at all; copying a signature
   with un-awaited `searchParams` from training-data Next 13/14 breaks the
   build.
4. **Nav self-consistency beats cleverness.** The nav is duplicated per page
   by design (there is no shared header component, and creating one now means
   touching `app/layout.tsx`-adjacent design — out of scope and against the
   "keep changes small" rule). Add one Button per file, identically placed;
   resist the refactor.
5. **`/resources` links to `/cards` twice** (nav row AND an in-content link
   around line 361). Only the nav row gets a Stores link — don't inject links
   into editorial content.
6. **Category values come from data, not an enum** — group with whatever
   strings exist (check `lib/data.ts` `stores[].category` for the real
   values); don't hardcode a category list that silently drops stores whose
   category isn't in it. A store with an unexpected category must still
   render (that's why grouping is a `Map` built from the data, with no
   filtering).
7. **Keep the page a server component with zero client islands** — no
   `"use client"`, no state. The interactive pieces (`SearchBar`, `StoreCard`
   links) are already-existing components; if one of them is a client
   component that's fine, but the page itself must not become one.
8. **Style constraints:** soft-emerald premium SaaS look is preserved by
   copying `/search`'s classes wholesale; do not introduce new colours,
   fonts, or spacing systems. Australian spelling in every string.
9. **OG/JSON-LD are non-goals here.** The site-level JSON-LD and OG image
   already exist at the root; per-page structured data for a directory adds
   little and risks Rich-Results lint noise. Explicitly out of scope — do
   not add `opengraph-image.tsx` or `JsonLd` usage to this page.

## Acceptance criteria

- [ ] `GET /stores` returns 200 with every published store rendered exactly
      once, grouped under its category heading, each card linking to its
      existing `/stores/<id>` page.
- [ ] The header nav on `/`, `/deals`, `/cards`, `/search`, `/resources`,
      `/stores/<id>`, and the 404 page each contain exactly one new "Stores"
      link, and the `/stores` page's own nav does not link to itself.
- [ ] `/sitemap.xml` contains `<loc>…/stores</loc>` exactly once, alongside
      the unchanged store-detail URLs.
- [ ] Mobile 375px: no horizontal overflow on `/stores` (verify via browser
      preview resize, per checklist §7's standard).
- [ ] With Supabase env removed locally (static fallback mode), `/stores`
      still renders the static store set — no crash, no empty page.
- [ ] `npm run lint`, `npm run build`, `npm run test:stack` pass on Node 20.
- [ ] `git diff --stat` shows only the files in the table above;
      `app/layout.tsx` and `app/globals.css` have no diff.
- [ ] FINAL-LAUNCH-CHECKLIST.md no longer claims `/stores` 404s by design.
