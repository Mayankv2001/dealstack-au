# Master Improvement Programme — DealStack AU

> Compiled 2026-07-20 from the full-repository audit (HEAD `9b7365f`; audits in `docs/audit/`). Companion files in this folder: roadmap, dependency map, risk register, validation matrix, release gates, manager–worker guide, task index.

## Product goals (unchanged; the yardstick for every task)
Truthful information → easy decisions → customer trust → minimal interface → useful output → mobile usability → current, verifiable data → confirmed facts clearly separated from estimates. Uncertainty is displayed, never hidden.

## Current-state summary
The codebase is in unusually good shape: pure dependency-injected engines, timing-safe cron auth, DST-safe Sydney scheduling, guaranteed lock finalisation, read-time expiry filtering on every public path, honest static-fallback separation, and a 4,100+-test green suite. The classic failure modes were mostly engineered against before this audit. Full assessment: `docs/audit/CURRENT-STATE-AUDIT.md`.

What is actually wrong falls into four buckets:
1. **Local/CI truth is broken:** `tsc --noEmit` red at HEAD (TASK-TEST-001); stale agent worktrees make lint/vitest lie (TASK-TEST-002); PROJECT_STATE contradicts itself about migration state (TASK-DOC-001).
2. **Production liveness is unverified:** evidence from 2026-07-13 says the GitHub Actions `CRON_SECRET` was missing — if still true, no scheduled ingestion/reconciliation runs at all (TASK-CRON-003), and every "stale data is prevented" claim is unproven (DQ-F3).
3. **Gated production work is parked:** migration 033 approval hardening + its 10-offer pre-review (TASK-DB-001, TASK-GC-001).
4. **Honesty gaps at the edges:** calculator vs engine divergence (TASK-STACK-001), never-checked layers escaping warnings (TASK-EXP-001), weekly source fetched near-daily (TASK-CRON-001), plus P2/P3 experience, coverage and SEO items.

## Workstreams and open tasks (20 — see TASK-INDEX.md for links)
- **CRON** 001/002/003 — cadence contract, catch-up, production liveness verification.
- **DB + GC** DB-001, GC-001 — the gated 033 pair.
- **TEST** 001/002/003 — CI truth, tooling hygiene, property-based invariants.
- **STACK** 001 — one source of stacking truth (ADR-001).
- **EXP** 001/002 — freshness-warning honesty, expired-permalink presentation.
- **SEARCH** 001/002 — typo tolerance, zero-hit recovery.
- **REL** 001/002 — error-response hygiene, health-state vocabulary.
- **DOC** 001 — operator-truth repair.
- **PERF** 001 — baseline before optimisation. **A11Y** 001 — coverage expansion. **SEO** 001/002 — structured data + sitemap.

## Confirmed blockers
- TASK-TEST-001: next push to main should fail CI's typecheck gate. Fix first.
- TASK-TEST-002: until merged (or worktrees pruned), local `npm run lint`/root vitest cannot satisfy the commit checklist.
- TASK-DOC-001 before TASK-GC-001/TASK-DB-001: operators must read a self-consistent migration truth.

## High-risk areas (treat with the runbooks, not improvisation)
Production migration history is hand-applied and drifting with unproven backups (`docs/runbooks/MIGRATION-SAFETY.md`); the approval boundary and default-off source gates must never be weakened by any task (every task file carries a Production safety section); Vercel Hobby allows at most daily crons — scheduling changes are constrained.

## Execution order (waves — rationale in PRIORITY-ROADMAP.md)
- **Wave 0 — restore truth (serial-ish, small):** TEST-001 → TEST-002 → DOC-001.
- **Wave 1 — production reality (parallel where safe):** CRON-003 (observation) ∥ GC-001 (human review) → DB-001 (gated apply) ∥ CRON-001.
- **Wave 2 — honesty & experience:** STACK-001 → EXP-001 → TEST-003 (same modules, sequenced) ∥ SEARCH-001 → SEARCH-002 ∥ REL-001, REL-002, CRON-002.
- **Wave 3 — coverage & polish:** A11Y-001, EXP-002 (share the e2e spec — sequence) ∥ PERF-001 ∥ SEO-001, SEO-002.

## Dependencies
See TASK-DEPENDENCY-MAP.md. Hard edges: GC-001 → DB-001; DOC-001 before GC-001/DB-001; TEST-002 before trusting any local root-level validation. File-conflict edges (not concurrent): {STACK-001, EXP-001, TEST-003}, {SEARCH-001, SEARCH-002}, {A11Y-001, SEARCH-002, EXP-002} on the e2e spec, {CRON-001, CRON-002} on `schedule.ts`.

## Production safety requirements (every task, every agent)
No commit/push/migrate/deploy by implementation agents; no offer publication or approval; no source enablement; no env/secret changes; DB-001's apply is human-at-keyboard with the MIGRATION-SAFETY runbook and written risk acceptance while backups are unproven. Tasks needing production access stop and report instead.

## Expected customer benefit
Wave 0–1: the data customers see is demonstrably being refreshed, and the team can trust its own signals. Wave 2: the numbers on the page never disagree with each other, uncertainty is flagged symmetrically, search stops dead-ending on typos. Wave 3: assistive-tech and motion-safe correctness everywhere, discoverability, and a regression-proof performance floor.

## Completion definition
All 20 tasks Done or explicitly Rejected-with-reason in TASK-INDEX.md; release gates in RELEASE-GATES.md green; CRON-003's production observation confirms scheduled runs for ≥ 7 consecutive days; no P0/P1 finding open; audits' "Requires verification" items resolved to confirmed-fixed or confirmed-non-issues.
