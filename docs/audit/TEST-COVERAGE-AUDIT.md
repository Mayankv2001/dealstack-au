# Test Coverage & CI Audit

> Audit date: 2026-07-19 · HEAD `9b7365f` · Commands actually run this session are marked ✅; everything else is code inspection.

## What was run (read-only) ✅

| Command | Result |
|---|---|
| `npx vitest run` (repo root, Node 20) | **62 failed / 4,112 passed** — every failure in `.claude/worktrees/**` copies; the real `tests/` tree contributed zero failures |
| `npx vitest run tests` | identical (the CLI arg is a substring filter; worktree paths contain `/tests/` too) |
| `npx tsc --noEmit` | **FAILS**: 2 real errors in `tests/decision/buildDecisionResult.test.ts:80` and `tests/decision/giftCardRanking.test.ts:8` (`DealsBundle.stackData` now required, fixtures omit it) |
| `npm run lint` | **2,512 errors / 29,757 warnings — all in `.claude/worktrees/**`**; real tree clean |

## Suite inventory

143 test files under `tests/`: admin 39 · giftcards 53 · monitor 21 · stack 20 · deals 6 · decision 2 · text 1. Playwright: 1 spec (`public-flows.spec.ts`), 2 projects (desktop + Pixel 5), ~30 routes, one axe test covering 7 routes (lines 783-808). CI (`ci.yml`): lint → `tsc --noEmit` → six scoped vitest suites → build → HTTP smoke (`npm run smoke`) → Playwright on static-fallback data. Plus `schema-drift.yml`.

## Confirmed defects

### TC-F1 — CI typecheck gate is red at HEAD *(→ TASK-TEST-001, P1)*
The two `tests/decision` fixtures were not updated when `DealsBundle` gained a required `stackData` (merchant-facts change `a783e12`). `npm run test:decision` still passes (vitest doesn't typecheck), which is how it slipped through — the fix task also adds the missing guard reasoning.

### TC-F2 — Tooling configs don't exclude `.claude/worktrees/` *(→ TASK-TEST-002, P1)*
`vitest.config.ts` excludes only `tests/e2e/**`/node_modules/.git; `eslint.config.mjs` ignores only `.next/out/build`; `tsconfig.json` includes `**/*.ts`. Any stale agent worktree inside the repo poisons the three main validation commands with false failures — exactly what happened. Fix the three configs; also document worktree hygiene (see ADR-002).

## Gaps (enhancements)

- **Property-based invariants for the stack engine** *(→ TASK-TEST-003)*: existing stack tests are example-based. Pin: `finalEffectivePrice ≥ 0`; `payAtCheckout = effectivePrice + cashbackLater`; `verifiedSaving ≤ totalSaving`; points value never reduces cash price; `excludedLayer` only when both layers positive and exclusion flagged. DS-096 covers gift-card *valuation* formulas; this extends to `buildStack`/`calculateStack`.
- **Weekly-cadence schedule contract** *(folded into TASK-CRON-001)*: no test pins that the Point Hacks source runs at most weekly — because the code doesn't do that yet.
- **Search zero-result behaviour** *(folded into TASK-SEARCH-002)*: no unit or e2e case for a no-hit query.
- **Axe coverage 7 routes, no detail templates** *(→ TASK-A11Y-001)*.
- **Degraded-state e2e** (configured-but-unreachable Supabase must serve honest empties): DS-095, still open, still valuable.
- **CI suite drift risk:** `ci.yml` lists the six suites individually; a new `tests/<area>` folder would silently not run in CI (vitest root-run can't be the backstop until TC-F2 is fixed — after TASK-TEST-002, consider replacing the six lines with one `npx vitest run`). Noted inside TASK-TEST-002's scope.

## Healthy patterns worth preserving

Dependency injection everywhere (clock, fetch, persistence) keeps tests network-free and deterministic; DST tests use fixed instants; route-level tests assert gate ORDER (auth → env → source → hour → interval → lock), not just outcomes; hostile-input fixtures are ticketed (DS-047); e2e asserts on content stable across static/DB modes.
