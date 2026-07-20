# TASK-PERF-001 — Establish a performance baseline and budgets before any optimisation

## Status
Planned

## Priority
P2

## Workstream
PERF

## Problem statement
No performance baseline exists: nothing records first-load JS per route, Supabase query counts per page render, or lab web-vitals for the key pages. The architecture is performance-sound by construction (server-first, ISR, lean deps — see `docs/audit/PERFORMANCE-AUDIT.md`), so the risk is not "the site is slow" but "we cannot detect when a change makes it slow", and optimisation work has nothing to anchor against.

Classification: Enhancement (measurement infrastructure). Optimisation tasks must NOT be created until this baseline exists — that ordering is the point.

## User impact
Indirect: regressions (bundle growth, query fan-out) would currently ship silently.

## Evidence
- No bundle/vitals artefacts or budget config anywhere in the repo (grep `budget`, `lighthouse`, `bundle-analyz`).
- `ci.yml` runs `next build` but discards the route-size table.
- `docs/audit/PERFORMANCE-AUDIT.md` PERF-F1.

## Root cause or likely cause
Never prioritised; the stack's defaults were good enough not to force the question.

## Scope
1. **Route-size snapshot:** capture `next build` output (route table: size + first-load JS) into a checked-in `docs/performance/BASELINE.md`, with the command documented so it is reproducible.
2. **Query-count inventory:** for `/`, `/deals`, `/gift-cards`, `/search`, `/stores/[slug]`, count repo calls per render by code inspection (each `lib/repos/*` call site) and record in the same file. This is static analysis, not tracing — say so in the doc.
3. **Lab vitals:** one local Lighthouse run (mobile emulation) against `npm run dev`… no — use `next build && next start` locally for honest numbers; record LCP/CLS/TBT for `/`, `/deals`, `/gift-cards`, `/search`. Note run conditions.
4. **Budgets:** propose (in the doc, not in CI yet) first-load-JS and LCP budgets per page class based on the measured baseline + headroom.
5. Optional if trivial: a `scripts/` helper that re-runs the route-table capture for future comparison.

Explicitly: no optimisation changes in this task, even if a number looks bad — file findings as new task candidates in the doc's final section instead.

## Out of scope
- CI enforcement of budgets (follow-up once numbers are trusted).
- Production/RUM measurement (Vercel Analytics already collects basics — reference, don't rebuild).
- Any code change to app/lib.

## Relevant files
- New: `docs/performance/BASELINE.md` (+ optional `scripts/perf-baseline.mjs`)
- Read-only: `app/*/page.tsx`, `lib/repos/*`, `ci.yml`

## Data and schema considerations
None. Run measurements on static-fallback data (no env needed) and say so — DB-mode numbers will differ; that caveat goes in the doc.

## Security considerations
None. Do not point Lighthouse at production with authenticated routes; public pages only.

## Implementation plan
1. Build, capture route table.
2. Inspect and tabulate repo-call counts per page.
3. `next start` + Lighthouse (CLI or Chrome) × 4 pages, 3 runs each, record medians.
4. Write BASELINE.md with budgets proposal and any spawned task candidates.

## Required tests
None (measurement task). The deliverable is the reproducible doc.

## Validation commands
```bash
npm run build   # source of the route table
```

## Manual verification
Doc review: every number carries its command and conditions; no unexplained figures.

## Production safety
Local-only measurement; production touched at most by read-only page loads.

## Dependencies
TASK-TEST-002 (worktree exclusion) makes local commands trustworthy — run after it if possible, but not blocking.

## Parallelisation notes
Read-only w.r.t. app code — safe alongside any task; numbers may shift if run mid-way through others' merges, so capture on a clean checkout of main.

## Rollback or recovery
Delete the doc.

## Acceptance criteria
- BASELINE.md exists with reproducible route sizes, query counts, lab vitals, proposed budgets, and a (possibly empty) list of evidence-backed optimisation candidates.

## Definition of done
Criteria met; every claimed measurement actually run and its output preserved.

## Implementation-agent prompt

Implement this task completely.

Before starting:
1. Read this task and `docs/audit/PERFORMANCE-AUDIT.md`.
2. Confirm no baseline doc already exists (`ls docs/performance` / grep "BASELINE").
3. Check `git status`; preserve unrelated work. Use Node 20 (`nvm use 20`).

During the work:
- Measure; do not optimise. No app/lib code changes.
- Record commands and conditions with every number; run Lighthouse against `next start`, not dev.
- Do not commit, push, migrate, deploy, or measure authenticated/admin routes.

After the work:
- Report the doc path, headline numbers, proposed budgets, and any optimisation candidates you would spawn as future tasks (with evidence).
