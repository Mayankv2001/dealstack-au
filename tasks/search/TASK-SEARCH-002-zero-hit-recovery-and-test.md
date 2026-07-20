# TASK-SEARCH-002 — Zero-hit search recovery: suggestions, and a test pinning the state

## Status
Planned

## Priority
P2

## Workstream
SEARCH — experience

## Problem statement
The zero-hit state on `/search` is honest but a dead end. `app/search/page.tsx:280-292` renders a "No reviewed match yet" card with static example text ("Try a retailer such as Myer or JB Hi-Fi…"). It offers no store suggestions derived from the actual query, no links, no popular-stores list, and no one-tap way to clear the query. Nothing in the unit or e2e suites pins this state — the e2e spec (`tests/e2e/public-flows.spec.ts`) asserts only happy-path queries.

Classification: Enhancement (state verified present and honest 2026-07-19; the audit's first draft wrongly said it was missing — see corrected UX-F1 in `docs/audit/PUBLIC-UX-AUDIT.md`).

## User impact
A shopper who typos or searches an uncovered store gets a polite dead end; each is a lost session on the primary entry surface.

## Evidence
- `app/search/page.tsx:131-139` (`noResults` condition), `:280-292` (the card).
- `tests/e2e/public-flows.spec.ts` — no zero-hit assertion (grep "No reviewed match").
- Store pool available server-side on the same page (`result.stores` is already loaded — see usages around `StackRecommendationCard`).

## Root cause or likely cause
The empty state was written as copy, not as a recovery surface; no test forced the question.

## Scope
- Enrich the zero-hit card with, in order:
  1. Up to 3 "Did you mean" store links when the query is near a known store/alias (reuse TASK-SEARCH-001's helper if it has landed; otherwise a simple prefix/substring pass over `result.stores` names is acceptable — say which you used).
  2. A short list of browsable entry points: links to `/stores`, `/deals`, `/gift-cards` (plain links, minimal — no new components).
  3. A "Clear search" link to `/search`.
- Keep the honest "New reviewed records appear after approval" sentence.
- Add an e2e assertion: `/search?q=zzzznothing` renders the card, the links are present, and (once TASK-A11Y-001 lands or in this task) the state is axe-clean.
- Add a unit test for the suggestion helper if one is written.

## Out of scope
- Matching-logic changes (TASK-SEARCH-001).
- Search analytics.
- Any redesign of populated-results layout.

## Relevant files
- `app/search/page.tsx`
- `tests/e2e/public-flows.spec.ts`
- Possibly `lib/sources/normalise.ts` (only if reusing the near-match helper)

## Data and schema considerations
None.

## Security considerations
Echoing the query is already done elsewhere on the page via JSX (auto-escaped); keep suggestions built from the trusted store list only — never from the raw query.

## Implementation plan
1. e2e failing test first (zero-hit card + links).
2. Implement suggestions + links inside the existing Card; match existing Tailwind idiom on the page.
3. Verify mobile layout (the card is `max-w-2xl mx-auto`; links should wrap).

## Required tests
- e2e zero-hit assertion (both viewport projects run it automatically).
- Unit test for any new suggestion helper.

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run build
npx playwright test tests/e2e/public-flows.spec.ts   # if harness available locally
```

## Manual verification
Local dev, mobile viewport: `/search?q=myrr` shows did-you-mean links that navigate correctly; `/search?q=zzzz` shows browse links; clear-search returns to the empty planner state.

## Production safety
Read-path UI only.

## Dependencies
Soft dependency on TASK-SEARCH-001 (better suggestions); do not block on it.

## Parallelisation notes
Same files as TASK-SEARCH-001 — sequence the two, either order. Safe alongside everything else.

## Rollback or recovery
Revert commit.

## Acceptance criteria
- Zero-hit state offers at least one useful onward action (suggestion link, browse link, clear) and is pinned by an e2e test.
- No change to populated-results behaviour.

## Definition of done
Criteria met; validation green; changed files and screenshots (if harness available) reported.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this task and `app/search/page.tsx` (especially lines 131-139 and 280-292).
2. Verify the zero-hit card still matches the description; check whether TASK-SEARCH-001's near-match helper exists in `lib/sources/normalise.ts` and use it if so.
3. Check `git status`; preserve unrelated work.

During implementation:
- e2e test first; smallest complete change; suggestions come only from the trusted store list; keep the honest approval sentence.
- Do not commit, push, migrate, deploy, or add dependencies/analytics.

After implementation:
- Run: `npm run lint && npx tsc --noEmit && npm run build` and the Playwright spec if available.
- Report changed files, which suggestion mechanism you used, and test results.
