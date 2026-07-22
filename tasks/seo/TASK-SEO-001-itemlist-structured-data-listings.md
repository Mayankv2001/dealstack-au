# TASK-SEO-001 — ItemList structured data on the listing pages

## Status
Done — 2026-07-22. Added `buildItemListJsonLd(siteUrl, items)` to `lib/structuredData.ts` (1-based contiguous positions, URL absolutisation, empty-list ⇒ null, drops empty entries) with 8 new unit tests (25/25 green in `tests/stack/structuredData.test.ts`). Wired into `/stores` (all stores in grouped render order), `/gift-cards` (published offers, cap 20), and `/deals` (canonical unparameterised listing only — searched/filtered/paged views emit none, mirroring the `/search` exclusion). Verified live on the static preview: `/stores` 9-item, `/gift-cards` 9-item (exactly matches the 9 rendered offer cards), `/deals` 12-item within cap; `/deals?q=tv` correctly emits no ItemList. lint + `tsc --noEmit` + `next build` all green; no console errors.

## Priority
P3

## Workstream
SEO

## Problem statement
JSON-LD exists only on `/` (WebSite/Organization), `/deals/[slug]` and `/stores/[slug]` (breadcrumbs) — verified by grep of `JsonLd` usage (`app/page.tsx`, `app/deals/[slug]/page.tsx`, `app/stores/[slug]/page.tsx`). `lib/structuredData.ts` has four builders (`buildWebSiteJsonLd`, `buildOrganizationJsonLd`, `buildStoreBreadcrumbJsonLd`, `buildDealBreadcrumbJsonLd`) and a hardened `serializeJsonLd`. The listing pages that aggregate the product's real value — `/deals`, `/stores`, `/gift-cards` — expose no `ItemList` markup, so search engines see them as unstructured pages.

Gift-card *detail* structured data is already ticketed (DS-064/DS-065 in `docs/backlog/DEALSTACK-BACKLOG.md`) — this task is only the listing-page `ItemList` gap, which the backlog does not cover.

Classification: Enhancement.

## User impact
Indirect: weaker eligibility for rich results and sitelinks; discovery of the deal/store/gift-card indexes suffers.

## Evidence
- `lib/structuredData.ts:31-142` — existing builders; no ItemList builder.
- Grep `JsonLd` → 3 pages + the component.
- `docs/audit/CURRENT-STATE-AUDIT.md` design-weakness list ("listing-page ItemList remains unticketed").

## Root cause or likely cause
Structured data was added page-by-page for the detail templates; listings were never covered.

## Scope
- Add `buildItemListJsonLd(items: {name, url, position}[])` to `lib/structuredData.ts`, following the existing builders' style (typed, no `any`, absolute URLs from `siteUrl()`).
- Emit it on `/deals` (ranked deals as displayed, capped ~20), `/stores` (store list), `/gift-cards` (published offers as displayed).
- Items must reflect exactly what the page renders after expiry filtering — never emit an expired or unpublished row (the repos already filter; consume their output, don't re-query).
- Unit-test the builder (positions 1-based, URL absolutisation, empty-list ⇒ null/omitted).

## Out of scope
- Offer/Product schema on detail pages (DS-064/065).
- Any visible UI change.
- `/search` (query-dependent pages should not carry ItemList).

## Relevant files
- `lib/structuredData.ts`, `components/JsonLd.tsx`
- `app/deals/page.tsx`, `app/stores/page.tsx`, `app/gift-cards/page.tsx`
- Tests: colocate with existing structuredData tests (grep `structuredData` under `tests/`; create `tests/text/structuredData.test.ts`-style file if none)

## Data and schema considerations
None — read-path only, consumes already-filtered page data.

## Security considerations
Use `serializeJsonLd` (existing escaping); never interpolate user input (listing pages have no query input except filters — build the list from the filtered server data, which is reviewed content).

## Implementation plan
1. Builder + unit tests first.
2. Wire into the three pages inside the existing server components (same pattern as `app/page.tsx`'s JsonLd usage).
3. Validate output shape with Google's schema (manually paste one payload into the Rich Results test — document, don't automate).

## Required tests
Builder unit tests; one render assertion per page that a `script[type="application/ld+json"]` containing `"ItemList"` is present (e2e or RTL, match existing conventions).

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run build
```

## Manual verification
View source on the three pages locally; paste `/deals` payload into the Rich Results test (read-only, external).

## Production safety
Additive head markup; ISR pages re-render on next revalidation; no data writes.

## Dependencies
None. Coordinate with DS-064/065 executor to share builder conventions if both run.

## Parallelisation notes
Touches the three listing page files — avoid running concurrently with tasks editing the same pages (none currently planned). Safe alongside everything else.

## Rollback or recovery
Revert commit.

## Acceptance criteria
- Valid ItemList JSON-LD on `/deals`, `/stores`, `/gift-cards` reflecting exactly the rendered, expiry-filtered items; tests green.

## Definition of done
Criteria met; validation green; one sample payload included in the report.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this task, `lib/structuredData.ts`, `components/JsonLd.tsx`, and how `app/page.tsx` mounts JSON-LD.
2. Verify listing pages still lack ItemList (grep `ItemList`). Check DS-064/065 status in `docs/backlog/DEALSTACK-BACKLOG.md` — if a detail-schema task already added an ItemList builder, reuse it.
3. Check `git status`; preserve unrelated work.

During implementation:
- Builder + tests first; consume the pages' already-filtered data; use `serializeJsonLd`; no visible UI change.
- Do not commit, push, migrate, or deploy.

After implementation:
- Run: `npm run lint && npx tsc --noEmit && npm run build`.
- Report changed files, tests, and paste one generated payload for review.
