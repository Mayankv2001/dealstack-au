# Worker prompt — TASK-003 (`/deals` disclaimer wording accuracy)

You are a coding worker on the DealStack AU repository. You will implement exactly one single-sentence copy change, defined in a task file. You are not the manager; do not re-plan the backlog or start any other task.

## Before you write anything

1. Read `docs/launch-management/tasks/TASK-003-deals-disclaimer-wording-accuracy.md` in full. It is the specification. If anything below conflicts with it, the task file wins.
2. Read the repository instructions: `CLAUDE.md` and `AGENTS.md`. Relevant hard rules: preserve the existing visual style; Australian spelling; keep changes small; do not remove features.
3. Inspect before editing:
   - `components/DealsClient.tsx` — find the "How to verify before you buy" section near the bottom and its disclaimer paragraph containing "manually curated, cached examples — not live data".
   - `components/HomeClient.tsx` footer disclaimer — the accurate register to mirror ("manually curated and served from a cache").
4. Run `git status` and confirm the working tree is clean. If not, STOP and report.

## Task assumptions — verify, then proceed

If the disclaimer text has already changed and no longer says "examples", the task is already done or superseded: STOP and report what the paragraph currently says.

## Implement (only this)

In `components/DealsClient.tsx`, replace the first sentence of that disclaimer paragraph:

- Old: `These are manually curated, cached examples — not live data.`
- New: `These offers are manually curated and served from a cache — not live data.`

Keep the rest of the paragraph exactly as it is ("Offers change quickly. Always verify with the original source, cashback provider, gift card portal, or retailer before purchasing. DealStack AU is not affiliated with any retailer, program or provider mentioned."). No structural, attribute, class, or logic changes. Touch no other string.

The new copy must not contain any of these banned markers: `Illustrative sign-up bonus`, `Illustrative statement credit`, `Sample only`, `placeholder URL`, `lorem ipsum`, `Application error`, `Expired / unknown`, `localhost:3000`.

## Verify (all must pass; run exactly these)

```bash
nvm use 20
npm run lint
npm run build
# in a second shell: npm run start   (leave running)
npm run smoke -- --strict-content
git status
git diff components/DealsClient.tsx
```

If you cannot run a second shell, run `npm run start &`, wait for the server to respond on http://localhost:3000, run the smoke, then stop the server — and say in the report exactly how you ran it. If any command fails, fix within scope or report honestly. Never claim success for a command that failed.

## Before reporting

Review your own diff. It must be one file, one paragraph, copy-only.

## Completion report (required format)

1. Implementation summary (old sentence → new sentence, verbatim).
2. Files changed.
3. Tests added/updated (expected: none — say so explicitly).
4. Exact verification commands and results (include the smoke pass/fail counts).
5. Unresolved concerns.
6. Commit hash if you committed (suggestion: `Fix /deals disclaimer: curated cached data, not "examples"`).
7. Confirmation that no files outside scope were modified, with `git status` output.
