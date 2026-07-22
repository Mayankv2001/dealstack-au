# TASK-SEARCH-001 — Reduce typo-to-zero-hit failures in search matching

## Status
Done — 2026-07-22. Added a bounded, dependency-free OSA (transposition-aware) `boundedOsaDistance` to `lib/sources/normalise.ts` and a near-match fallback in `lib/giftcards/resolveMerchantAlias.ts` — the live search's actual resolver (the task's original `searchSources.ts`/`rankSourceResults` reference predates the decision-pipeline redesign). Near-match runs ONLY when exact resolution finds nothing, resolves ONLY a unique store at the single smallest in-threshold distance (edit ≤1, or ≤2 once either side ≥6 chars; min length 4; query capped 64), and ties across different stores fall through to zero-hit. Threaded a `queryCorrection` onto `DecisionResult` and render an honest "Showing results for <store> — searched '<query>'" note on `/search`. Exact hits (`method:"exact"`) always win; general `terms.every` matching untouched. Browser-verified: `myre`→Myer with note, `myer` exact (no note), `zzzzzz`→zero-hit card. Unit tests: 6 distance + 9 resolver cases; test:monitor 315/315, test:giftcards 622/622, lint + tsc + build green.

Note: `npm run test:decision` has one PRE-EXISTING failing test (`buildDecisionResult` retailer gift-card plan) that is red on `main` independent of this work — flagged separately, not caused here.

## Priority
P2

## Workstream
SEARCH — correctness & discovery

## Problem statement
Search matching is exact-substring with every-term-must-match:

- `lib/sources/searchSources.ts:118-144` (`rankSourceResults`) — `terms.every((term) => text.includes(term) || …merchantId match)`. One misspelled term ("jbhifi" vs "jb hi-fi" is handled by aliases, but "myre" for "myer" is not) zeroes the whole result set.
- The only fuzziness is the reviewed alias table: `MERCHANT_ALIASES` in `lib/sources/normalise.ts:17` plus `findMerchantIdInText` longest-substring alias resolution. Aliases cover known alternate names, not typos or partial words.
- The same pipeline serves the Supabase pool (`lib/repos/sourceResults.ts`) and the static pool, so one fix covers both.

Classification: Design weakness (behaviour confirmed in code; zero-hit frequency in production is unmeasured — no search analytics exist).

## User impact
A shopper typing one wrong character gets "No reviewed match yet" instead of the store they meant, and likely leaves. Search is the primary entry point on the homepage hero.

## Evidence
- `lib/sources/searchSources.ts:126-135` — the every-term filter.
- `lib/sources/normalise.ts:17-60` — alias table + exact/substring resolvers (no edit-distance).
- `app/search/page.tsx:131-139` — zero-hit state that typos land on.
- Cross-ref: `docs/audit/CURRENT-STATE-AUDIT.md` design-weakness list; `docs/audit/PUBLIC-UX-AUDIT.md` UX-F1.

## Root cause or likely cause
The matcher was written for the reviewed static pool where titles are controlled; typo tolerance was never a requirement.

## Scope
- Add a bounded, dependency-free near-match layer for **store/alias resolution only** (not free-text results): when `findMerchantIdInText` resolves nothing, try edit-distance ≤ 1 (≤ 2 for length ≥ 6) against the normalised alias table, longest-first, and treat a unique hit as the query's merchant.
- When a near-match is used, surface it honestly: thread a `resolvedVia: "near-match"` (or similar) flag so the UI can render "Showing results for **Myer** (searched 'myre')".
- Keep every-term-must-match for the residual free-text terms (do NOT loosen general matching — precision over recall is correct for a truth-first product).
- Property of the change: an exact alias hit must always beat a near-match; ambiguous near-matches (two stores at the same distance) resolve to nothing (fall through to zero-hit + TASK-SEARCH-002's recovery).

## Out of scope
- Search analytics (worth its own ticket if wanted; do not add tracking here).
- External search libraries or services — keep it dependency-free.
- Zero-hit page UX (TASK-SEARCH-002).
- Loosening `terms.every` to `terms.some`.

## Relevant files
- `lib/sources/normalise.ts` (resolution + new distance helper)
- `lib/sources/searchSources.ts` (thread the flag)
- `app/search/page.tsx` (render the "showing results for" note)
- `tests/monitor/` or wherever normalise/search tests live (grep `findMerchantIdInText` in `tests/`)

## Data and schema considerations
None.

## Security considerations
Edit-distance runs on normalised, length-bounded strings against a fixed alias table — no injection or DoS surface; still, cap query length before the distance loop (queries are already normalised; add a sanity cap ~64 chars for the distance pass).

## Implementation plan
1. Failing tests first: "myre" resolves to myer's store id; "myer" still resolves exactly; a string equidistant from two aliases resolves to null; distance pass never overrides an exact hit.
2. Implement a small bounded Levenshtein (or OSA) helper with early-exit at the threshold.
3. Thread the near-match flag to the search page; render the note.
4. e2e: extend the search assertions with one typo query (`/search?q=myre`) expecting the corrected store heading.

## Required tests
As above — unit tests colocated with existing normalise tests; one e2e addition.

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run test:monitor && npm run build
```
Plus the e2e spec if the harness is available locally: `npx playwright test tests/e2e/public-flows.spec.ts`.

## Manual verification
Local dev: `/search?q=myre&spend=500` shows Myer results with the correction note; `/search?q=zzzz` still shows the zero-hit card.

## Production safety
Pure read-path logic; no writes; static and DB pools share the pipeline so behaviour is testable offline.

## Dependencies
None. Complements TASK-SEARCH-002 (zero-hit recovery) — either order works.

## Parallelisation notes
Touches `lib/sources/` + `app/search/page.tsx` — do not run concurrently with TASK-SEARCH-002 (same files). Safe alongside stack/cron/SEO tasks.

## Rollback or recovery
Revert commit.

## Acceptance criteria
- Single-character typos on known store names resolve to the intended store with an honest correction note.
- Exact matches and ambiguity behaviour unchanged and test-pinned; no general-match loosening.

## Definition of done
Criteria met; validation green; changed files and test deltas reported.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this task, `lib/sources/normalise.ts`, `lib/sources/searchSources.ts`, and the zero-hit block in `app/search/page.tsx:131-139,280-292`.
2. Verify matching is still exact-substring every-term and that no distance helper exists. If search has been reworked, stop and report.
3. Check `git status`; preserve unrelated work.

During implementation:
- Tests first; keep the near-match layer bounded to store/alias resolution; never override exact hits; ambiguous ⇒ null.
- No new dependencies. Do not add analytics. Do not commit, push, migrate, or deploy.

After implementation:
- Run: `npm run lint && npx tsc --noEmit && npm run test:monitor && npm run build` (+ Playwright if available).
- Report changed files, tests added, and any alias-table entries you found insufficient (list them; do not invent new aliases without evidence).
