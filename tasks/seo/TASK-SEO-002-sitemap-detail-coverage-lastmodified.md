# TASK-SEO-002 — Sitemap: cover live detail routes and add lastModified

## Status
Planned

## Priority
P3

## Workstream
SEO

## Problem statement
`app/sitemap.ts` (72 lines) covers static routes, stores, live weekly deals, gift-card products and rewards programmes — but omits entire live route families and carries no `lastModified` on any entry:

- `/gift-cards/[id]` — published gift-card offer detail pages exist (`app/gift-cards/[id]/page.tsx`; 13 published offers per PROJECT_STATE) and are absent.
- `/cards/[id]` and `/cards/compare` — card detail/compare routes exist and are absent (`/cards` index is present).
- `/gift-cards/weekly/plan` — route exists (`app/gift-cards/weekly/plan/page.tsx`), absent.
- Every entry sets `changeFrequency` but not `lastModified`, so crawlers get no freshness signal despite the data carrying `lastCheckedAt`/updated timestamps.

Classification: Confirmed gap (routes verified to exist and to be sitemap-absent, 2026-07-19).

## User impact
Indirect: offer detail pages — the most conversion-relevant URLs — depend on internal-link crawling for discovery, and freshness signals are absent sitewide.

## Evidence
- `app/sitemap.ts:16-72` — full current coverage; no `lastModified` anywhere.
- Route existence: `find app/gift-cards -name page.tsx` (includes `[id]`, `weekly/plan`), `ls app/cards` (`[id]`, `compare`).
- The sitemap already follows the right safety pattern for deals ("Live deals only … expired permalinks still render for inbound links, but we do not advertise them") — extend that exact pattern.

## Root cause or likely cause
The sitemap predates the gift-card offer detail and card detail routes.

## Scope
- Add live, published gift-card offer detail URLs via the same public repo the pages render from (`lib/giftcards/currentOffers.ts` / `publicQuery.ts` — reuse the page's own loader so the sitemap can never advertise a URL that 404s or an expired offer).
- Add live card detail URLs the same way (find the `/cards/[id]` loader in `lib/repos/`).
- Add `/cards/compare` and `/gift-cards/weekly/plan` to the static list.
- Add `lastModified` where a truthful timestamp exists (offer `lastCheckedAt`/updated-at; store updated-at if available). Omit it where no honest timestamp exists — never fabricate.
- Unit test: sitemap contains a published fixture offer URL and no expired one (static-fallback data makes this deterministic — see how existing repo tests stub data).

## Out of scope
- robots.txt changes; metadata/canonical work; per-page `<meta>`.
- Priorities (`priority` field) — noise, skip.

## Relevant files
- `app/sitemap.ts`
- `lib/giftcards/currentOffers.ts`, `lib/repos/` card-offer loader
- New test file colocated with route/repo tests (match existing conventions; check `tests/` for any current sitemap test first)

## Data and schema considerations
Read-only reuse of expiry-filtered loaders; no schema change.

## Security considerations
None — URLs built from `siteUrl()` + internal ids/slugs.

## Implementation plan
1. Locate the exact loaders the detail pages use; reuse them (do not write new queries).
2. Failing unit test for offer-URL inclusion/expired exclusion.
3. Implement; keep `Promise.all` batching pattern.

## Required tests
As above; existing route tests stay green.

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run build
```
Then locally view `/sitemap.xml` and spot-check entries.

## Manual verification
Local `/sitemap.xml`: contains a `/gift-cards/<id>` for each published fixture offer, `/cards/compare`, `/gift-cards/weekly/plan`; `lastModified` present only where sourced from real data.

## Production safety
Read-path only. Sitemap grows by tens of URLs; no rate/size concern (limit is 50k).

## Dependencies
None.

## Parallelisation notes
Independent of everything; safe to run concurrently with any other task.

## Rollback or recovery
Revert commit.

## Acceptance criteria
- All live public detail routes are advertised; expired/unpublished never are; truthful `lastModified` where data supports it; test-pinned.

## Definition of done
Criteria met; validation green; sample sitemap excerpt in the report.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this task and `app/sitemap.ts`; enumerate current routes with `find app -name page.tsx` and diff against sitemap coverage — routes may have changed since 2026-07-19.
2. Identify the loaders the gift-card and card detail pages use; reuse them.
3. Check `git status`; preserve unrelated work.

During implementation:
- Test first; only advertise URLs the site renders live; never fabricate `lastModified`.
- Do not commit, push, migrate, or deploy.

After implementation:
- Run: `npm run lint && npx tsc --noEmit && npm run build`; render `/sitemap.xml` locally.
- Report changed files, tests, and a sitemap excerpt showing the new families.
