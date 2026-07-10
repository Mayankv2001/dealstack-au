# TASK-003: `/deals` disclaimer wording accuracy

## Status

READY

## Manager

Fable 5

## Recommended worker

Claude Haiku — a single-sentence public copy change with exact constraints.

## Severity

Low

## Launch impact

Recommended (public wording accuracy; not a blocker — the current copy errs in the safe direction)

## Problem

The bottom disclaimer on `/deals` says the listed offers are "manually curated, cached **examples** — not live data". In production the page serves real, admin-reviewed offers from Supabase (the static example dataset is code-guaranteed never to be served when Supabase is configured — see `fromDbOrDemo` in `lib/supabase/server.ts`). Calling real curated data "examples" understates the product on its main directory page and mildly contradicts the homepage footer, which uses the accurate phrasing "manually curated and served from a cache".

The protective intent of the sentence (data may be stale; verify before buying; not affiliated) is correct and must be preserved — only the word "examples" misdescribes the data.

## Evidence

- `components/DealsClient.tsx`, the `<section>` titled "How to verify before you buy" (bottom of the component, ~line 1036): `<strong>Disclaimer:</strong> These are manually curated, cached examples — not live data. …`
- Accurate sibling copy for comparison: `components/HomeClient.tsx` footer disclaimer (~line 741): "All discount codes, cashback rates, gift card discounts, points rates and expiry dates on DealStack AU are manually curated and served from a cache — offers change or expire without notice…".
- Production serves the Supabase dataset, not examples: `lib/supabase/server.ts` `fromDbOrDemo()` policy + prod verification 2026-07-10 (live DB rows: 43 signals, 9 stores, published offers; strict-content smoke against `https://dealstack-au.vercel.app` passed 28/28).

## Desired outcome

The `/deals` disclaimer accurately describes the data as manually curated and cached (possibly stale) — without calling it "examples" — while keeping every protective element: offers change quickly, always verify with the original source/provider/retailer before purchasing, and DealStack AU is not affiliated with anyone mentioned.

## Scope

Allowed to modify:

- `components/DealsClient.tsx` — the disclaimer `<p>` inside the "How to verify before you buy" section ONLY (one sentence of copy).

## Out of scope

- Every other string, section, style, and component in `DealsClient.tsx` (including the three `verificationNotes` and the section heading).
- `HomeClient.tsx` and all other public pages (their copy is already accurate).
- Any layout/styling/class changes; any logic changes.

## Implementation requirements

1. Replace the first sentence of the disclaimer with accurate copy, e.g.: `These offers are manually curated and served from a cache — not live data.` (mirroring the homepage footer register). Keep the remaining sentences ("Offers change quickly. Always verify with the original source, cashback provider, gift card portal, or retailer before purchasing. DealStack AU is not affiliated with any retailer, program or provider mentioned.") intact.
2. Australian spelling; no new claims (nothing implying real-time accuracy, verification guarantees, or affiliation).
3. The new copy must not contain any strict-smoke banned marker (`Illustrative sign-up bonus`, `Illustrative statement credit`, `Sample only`, `placeholder URL`, `lorem ipsum`, `Application error`, `Expired / unknown`, `localhost:3000`).

## Security and trust boundaries

- This is public trust copy: the change must not weaken the verify-before-buying warning or the non-affiliation statement. If in doubt, keep the sentence more cautious, not less.

## Acceptance criteria

1. `/deals` disclaimer no longer contains the word "examples"; it still contains "not live data" (or equivalently cautious phrasing), "verify", and "not affiliated".
2. Diff touches only the disclaimer `<p>` copy in `components/DealsClient.tsx` — no attribute, structure, or logic changes.
3. `npm run lint` and `npm run build` pass.
4. `npm run smoke -- --strict-content` against a local production build passes (run `npm run build && npm run start` in another shell, then the smoke; or state clearly if you verified with plain `npm run smoke` and why).
5. `git status` shows exactly one modified file.

## Required tests

None — there are no copy-level unit tests for this component, and adding one would merely mirror the string. The strict-content smoke check (criterion 4) is the required regression net. Do not add tests.

## Verification commands

```bash
nvm use 20
npm run lint
npm run build
# in a second shell: npm run start
npm run smoke -- --strict-content
git status
git diff components/DealsClient.tsx
```

## Documentation updates

None needed — no operator docs reference this sentence.

## Worker completion report

Return, in order:

1. Concise implementation summary (old sentence → new sentence).
2. Files changed.
3. Tests added or updated (expected: none — state this explicitly).
4. Exact verification commands run and their results.
5. Unresolved concerns.
6. Commit hash, if committed.
7. Confirmation that no files outside Scope were modified (`git status` output).

## Manager review checklist

- [ ] New sentence is factually accurate against `fromDbOrDemo` behaviour and no less cautious than before.
- [ ] "verify" guidance and non-affiliation statement intact, word-for-word or equivalent.
- [ ] Diff is copy-only, one file, one paragraph.
- [ ] Strict-content smoke passes (re-run myself).
- [ ] Australian spelling.

## Rollback considerations

Single-sentence copy change: plain `git revert`. Zero data or behaviour impact.

## Dependencies

- Predecessors: none.
- Successors: none.
- Parallel-safe with TASK-001 and TASK-002 (zero file overlap) when on separate branches/worktrees.
