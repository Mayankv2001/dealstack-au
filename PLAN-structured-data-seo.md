> **STATUS (2026-07-10): SHIPPED in `54fe741` — do not re-execute.**
> Kept for reference. Verify with `git log --oneline | grep 54fe741`.

# PLAN: Structured data & social previews — JSON-LD and Open Graph images

> **Rank: 10 of 10.**
> The site's distribution channel is organic search and link-sharing, and it
> currently ships **zero JSON-LD** (grep: no `application/ld+json` anywhere)
> and **zero Open Graph images** (no `opengraph-image.*`, no static OG
> asset). The good news: the foundation is already right — `app/layout.tsx`
> sets `metadataBase` + `openGraph` defaults (line 18+), store pages have
> per-store `generateMetadata` (`app/stores/[slug]/page.tsx:50`), and
> `robots.ts`/`sitemap.ts` exist. This plan adds the missing layers as pure
> additions: WebSite/Organization + BreadcrumbList JSON-LD, and generated OG
> images for the homepage and store pages. **Deliberately NO Offer/Product
> rich-result markup** — see the safety-adjacent reasoning below.

## Prerequisites

- Plans 1–5 complete (plan 4's docs refresh means READMEs reference /cards
  etc.; plan 2 means expired offers no longer render — relevant because
  structured data must not describe content the page no longer shows).
- `nvm use 20`; read `AGENTS.md`, then the Next 16 docs in
  `node_modules/next/dist/docs/` for: metadata API, `opengraph-image`
  file convention / `ImageResponse` — conventions may differ from training
  data; verify the file names and exports before writing them.
- Hard constraints: `app/layout.tsx` and `app/globals.css` are untouchable.
  Everything here goes in per-route files (`app/page.tsx`,
  `app/stores/[slug]/*`, new `opengraph-image.tsx` files) — all additive.

## Why NO Offer/Product schema (do not "improve" this)

Deal data here is third-party, admin-transcribed, expiry-prone, and framed
sitewide as "verify before you buy". Marking it up as schema.org
`Offer`/`Product` invites rich results asserting price/availability facts we
explicitly disclaim — a mismatch Google treats as spammy structured data
(manual-action territory), and a trust problem besides. Organisation,
WebSite (+SearchAction), and BreadcrumbList are facts about *our site* and
are safe. This is a scope wall, not an oversight.

## Goal

Every public page carries appropriate site-level JSON-LD; store pages add
breadcrumbs; the homepage and store pages produce branded OG images; social
shares of any public URL render a real preview card.

## Exact files to touch

| File | Change |
|---|---|
| `components/JsonLd.tsx` | **New** — tiny script-tag renderer |
| `lib/structuredData.ts` | **New** — pure builders (testable) |
| `app/page.tsx` | WebSite + Organization JSON-LD |
| `app/stores/[slug]/page.tsx` | BreadcrumbList JSON-LD |
| `app/opengraph-image.tsx` | **New** — sitewide default OG image |
| `app/stores/[slug]/opengraph-image.tsx` | **New** — per-store OG image |
| `tests/stack/structuredData.test.ts` | **New** — pure builder tests |

Optional (only if trivially true after reading the code): pass
`lastModified` in `app/sitemap.ts` if `getStores()` already exposes an
updated timestamp — do NOT widen the public `Store` type just for this.

## Step-by-step implementation order

### Step 1 — `components/JsonLd.tsx`

```tsx
/** Renders one JSON-LD block. Server component — usable from any page. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON-LD is not HTML; escape "<" to prevent </script> breakout.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
```

### Step 2 — `lib/structuredData.ts` (pure builders)

- `buildWebSiteJsonLd(siteUrl: string)`: `@type: WebSite`, `name:
  "DealStack AU"`, `url`, and a `potentialAction` SearchAction targeting
  `` `${siteUrl}/search?q={search_term_string}` `` with
  `"query-input": "required name=search_term_string"` — the `q` param name
  is verified against `app/search/page.tsx` (it reads `searchParams.q`).
- `buildOrganizationJsonLd(siteUrl: string)`: `@type: Organization`, name,
  url. Only include properties you have real values for — no fake `logo`
  URL until an actual logo asset exists (an OG image is not a logo).
- `buildStoreBreadcrumbJsonLd(siteUrl: string, store: { id: string; name:
  string })`: `@type: BreadcrumbList` with Home → Stores… use `Home →
  <store name>` (position 1 and 2) — there is NO `/stores` index page
  (only `/stores/[slug]`), so a "Stores" crumb would link a 404; verify by
  checking `app/` for a stores index before deciding on 2 vs 3 levels.

Get the site URL the way the rest of the app does — `siteUrl()` from
`lib/env.ts` (used by `app/sitemap.ts`) — passed in by the page, keeping the
builders pure and testable.

### Step 3 — inject into pages

- `app/page.tsx`: render `<JsonLd data={buildWebSiteJsonLd(...)} />` and
  `<JsonLd data={buildOrganizationJsonLd(...)} />` alongside (not inside)
  `<HomeClient …/>` — pages return fragments fine; do not touch HomeClient.
- `app/stores/[slug]/page.tsx`: after the existing `if (!store) notFound()`,
  render `<JsonLd data={buildStoreBreadcrumbJsonLd(...)} />` with the loaded
  store. Use fields already fetched — do not add queries.

### Step 4 — OG images (`ImageResponse`)

First read the Next 16 og-image docs (file name, `size`/`contentType`
exports, default export signature, `params` handling) — then:

- `app/opengraph-image.tsx`: 1200×630, brand look via inline styles only
  (the emerald palette — pick the exact hex values from existing Tailwind
  classes in the codebase, e.g. emerald-600 `#059669`; hardcode hexes, since
  Tailwind classes don't work inside ImageResponse). Content: wordmark
  "DealStack AU" + tagline "Stack cashback, gift cards & points at
  Australian stores." System font stack only — NO remote font fetching (CSP
  and edge-runtime cold-start cost; also external fetches at request time
  are against the spirit of the no-external-calls posture).
- `app/stores/[slug]/opengraph-image.tsx`: same frame, plus the store name
  large. Load the store via the same repo call the page uses
  (`getStores()`/equivalent — check `lib/repos/stores.ts` for a single-store
  getter); unknown slug → render the generic frame (do NOT throw; OG image
  routes should degrade, not 404 the preview).
- Do NOT add per-route `opengraph-image` for `/deals`, `/search`, `/cards`,
  `/resources` — the root default covers them (verify inheritance in the
  docs; if Next 16 doesn't inherit, note it and still stop at the root
  image; per-page duplicates can be a follow-up).

### Step 5 — tests: `tests/stack/structuredData.test.ts`

Pure builder tests: WebSite target URL contains
`/search?q={search_term_string}` and the exact `query-input` string;
breadcrumb positions are 1..n and item URLs absolute (start with the passed
siteUrl); no builder output contains `undefined`/empty-string properties
(assert via `JSON.stringify` snapshot or key checks); the `<` escaping in
`JsonLd` is covered by asserting the builder output round-trips
`JSON.parse`.

### Step 6 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:stack && npm run test:monitor && npm run test:admin
```

Then `npm run dev`:
- `curl -s http://localhost:3000/ | grep -o 'application/ld+json'` → 2 hits;
  same on a store page → 1 hit; paste each block into
  https://validator.schema.org (manual step) — zero errors.
- `curl -sI http://localhost:3000/opengraph-image` (exact path per docs —
  it may include a generated suffix; check the rendered `<meta
  property="og:image">` in page source instead if unsure) → 200,
  `content-type: image/png`.
- View source of `/stores/<real-slug>`: `og:image` points at the per-store
  image; `og:title` still the store-specific title from the existing
  `generateMetadata`.

## Edge cases a weaker model would miss

1. **`</script>` breakout**: JSON.stringify does not escape `<`, so a store
   name or tagline containing `</script>` would terminate the tag and inject
   markup. The `<` replace in `JsonLd` is mandatory, not cosmetic —
   admin-entered store names flow into the breadcrumb builder (plan 7 makes
   store names admin-editable).
2. **SearchAction must match the real param.** The search page reads `q`
   (verified `app/search/page.tsx:17-21` — and it may be
   `string | string[]`). If someone later renames the param, the JSON-LD
   silently lies; the test pinning `?q=` is the tripwire.
3. **No `/stores` index route exists** — a three-level breadcrumb would link
   a 404 and schema validators/Googlebot will follow it. Two levels unless
   you verify an index page exists.
4. **ImageResponse runs in a constrained runtime**: no Tailwind, limited
   flexbox-ish CSS subset, no remote assets without explicit fetches. Inline
   styles + system fonts keep it deterministic and fast. Also `size` and
   `contentType` exports and the params signature are convention-checked —
   copy them from the Next 16 docs, not memory.
5. **Per-store OG image must not add N build-time renders** — it renders
   on demand per request (with the route's ISR behaviour); don't wire it
   into `generateStaticParams`.
6. **Don't put JSON-LD in `app/layout.tsx`** even though it'd be one line —
   the layout is off-limits by project rule; per-page injection also keeps
   page-specific data (breadcrumbs) where it belongs.
7. **`metadataBase` already exists** (layout line 18) — do not re-derive
   absolute URLs by string concatenation inside metadata objects; only the
   JSON-LD builders need explicit absolute URLs (schema.org has no
   metadataBase concept).
8. **Unpublished/unknown store in the OG route**: after plan 7, stores can
   be unpublished while old share links live on. The OG route must return
   the generic image for missing stores, never a 500 — a broken image on an
   old share is a bad look; a generic brand card is fine.
9. **Australian English in all visible strings** (taglines, image text):
   "organisation" never appears in schema `@type`s (those are fixed vocab —
   `Organization` with a z is the correct schema.org type name even in AU
   English; do not "localise" it).
10. **Validate with the page's ACTUAL rendered output**, not the builder's
    return value — a server-component misplacement (e.g. inside a client
    boundary) can silently drop the script tag while unit tests stay green.
    The curl greps in Step 6 are the real check.

## Acceptance criteria

- [ ] Homepage HTML contains exactly two `application/ld+json` blocks
      (WebSite with SearchAction targeting `/search?q={search_term_string}`,
      and Organization); store pages contain one BreadcrumbList block with
      absolute URLs and no crumb pointing at a non-existent route.
- [ ] Both JSON-LD payloads pass validator.schema.org with zero errors
      (manual check, state it in the summary).
- [ ] `og:image` resolves to a 200 `image/png` 1200×630 on the homepage and
      on a real store page; an unknown store slug's OG route returns the
      generic image, not an error.
- [ ] `git diff --stat`: `app/layout.tsx` and `app/globals.css` untouched;
      no changes to HomeClient/DealsClient/other client islands; no
      Offer/Product schema anywhere
      (`grep -rn '"Offer"\|"Product"\|AggregateOffer' app lib components`
      is empty).
- [ ] New builder tests pass; lint + build + all three suites green
      (Node 20); no remote font/asset fetch appears in either OG route.
