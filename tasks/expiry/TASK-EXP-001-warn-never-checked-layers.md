# TASK-EXP-001 — Stack cards must warn about never-verified layers, not just stale ones

## Status
Planned

## Priority
P2

## Workstream
EXP — expiry & freshness honesty

## Problem statement
`staleDataWarning(lastCheckedAt, now, label)` in `lib/stack/compatibility.ts` returns `null` when `lastCheckedAt` is missing:

```ts
if (!lastCheckedAt) return null;
```

So a layer that was checked 22 days ago carries an explicit "terms may have changed" warning, while a layer that has **never** been verified carries no freshness warning at all — the less-trustworthy record presents as the cleaner one. The listing surfaces handle this honestly ("Not yet checked" via `lib/freshness.ts`), but stack recommendation cards communicate risk through the warnings array, where the gap lives.

Mitigation already present: unverified offers usually carry `confidence: "needs-verification"`, which produces a separate `needsVerificationWarning`. The gap is real for any layer whose confidence is `confirmed` (or whose confidence warning is the only signal) with a null `lastCheckedAt` — "confirmed but never date-stamped" is exactly the shape DS-006 found in production (confirmed + stale) in adjacent form.

Classification: Design weakness (confirmed behaviour; harm depends on data shapes that have occurred).

## User impact
A shopper comparing two stacks sees warnings on the verified-but-ageing one and none on the never-verified one, inverting the trust signal on the product's core surface.

## Evidence
- `lib/stack/compatibility.ts` (~line 137): early return on missing `lastCheckedAt`.
- `lib/stack/buildStack.ts`: `staleDataWarning` invoked for gift-card, cashback and points layers; `checkedAsOf` computed from used layers' timestamps only (null timestamps silently drop out, lines ~889-897).
- Contrast: `lib/freshness.ts` `"not-yet-checked"` state exists for listing surfaces.

## Root cause or likely cause
`staleDataWarning` was written to answer "is this check old?" and missing-timestamp was treated as not-applicable rather than worst-case.

## Scope
- Add a `neverCheckedWarning(lastCheckedAt, label)` (or extend `staleDataWarning`) returning a `StackWarning` (`level: "info"`, `code: "never-checked"`, message like `"${label} has not been verified yet — treat the figures as indicative."`) when `lastCheckedAt` is null/empty.
- Emit it from `buildStack.ts` at every site where `staleDataWarning` is emitted (gift-card, cashback, points-gift-card layers).
- Deduplicate against `needsVerificationWarning` where both would fire for the same layer — one freshness-type warning per layer is enough; define the precedence (needs-verification wins, never-checked fires only for confirmed-confidence layers) and test it.
- Verify `StackRecommendationCard` renders the new code without special-casing (warning list is generic).

## Out of scope
- Changing `checkedAsOf` aggregation semantics.
- Listing-surface freshness (already honest).
- Data fixes for rows missing timestamps (DS-001/006 territory).

## Relevant files
- `lib/stack/compatibility.ts`, `lib/stack/buildStack.ts`
- `components/StackRecommendationCard.tsx` (render check only)
- `tests/stack/` (compatibility + buildStack warning tests)

## Data and schema considerations
None — consumes existing nullable field.

## Security considerations
None.

## Implementation plan
1. Failing tests first: confirmed-confidence gift-card layer with null `lastCheckedAt` ⇒ `never-checked` warning present; needs-verification layer with null timestamp ⇒ only the needs-verification warning (no double-flag); 22-day-old timestamp ⇒ stale warning unchanged.
2. Implement the warning + precedence rule.
3. Snapshot/RTL check of the card rendering one such warning.

## Required tests
As above, in `tests/stack/`; all existing stack tests stay green (warning counts in existing fixtures may change — update deliberately and note each).

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run test:stack && npm run build
```

## Manual verification
Local dev: view a store whose static fixture lacks `lastCheckedAt` (or add one to the static bundle temporarily — do not commit fixture edits unless the test needs them) and confirm the card shows the new warning.

## Production safety
Pure presentation-logic addition; no data writes; static and DB modes both covered by the pure engine tests.

## Dependencies
None.

## Parallelisation notes
Touches the stack engine — do not run concurrently with TASK-TEST-003 (property tests over the same modules) or TASK-STACK-001; sequence any two of these.

## Rollback or recovery
Revert commit.

## Acceptance criteria
- Null-timestamp confirmed layers warn; precedence with needs-verification is deterministic and tested; no layer ever carries both warnings; existing warning behaviour otherwise unchanged.

## Definition of done
Criteria met; validation output, changed files and any fixture-expectation updates reported with reasons.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this task, `lib/stack/compatibility.ts`, the warning call sites in `lib/stack/buildStack.ts`, and the stack warning tests.
2. Verify `staleDataWarning` still returns null on missing timestamps; if behaviour changed, stop and report.
3. Check `git status`; preserve unrelated work.

During implementation:
- Tests first; smallest complete change; keep all other warning semantics identical.
- Do not commit, push, migrate, deploy, or touch production data.

After implementation:
- Run: `npm run lint && npx tsc --noEmit && npm run test:stack && npm run build`.
- Report changed files, test deltas (with justification for any updated expectations), and remaining risks.
