# Risk Register

> 2026-07-20. Risks to the programme and to production while executing it. Severity × likelihood are judgement calls from audit evidence; owners to fill in.

| # | Risk | Sev | Lik | Evidence | Mitigation | Trigger to re-assess |
|---|---|---|---|---|---|---|
| R1 | Scheduled ingestion not running in production at all (Actions secret missing) → silently ageing data behind honest-looking pages | High | Medium-High | 2026-07-13 evidence (DS-078); unverified since | TASK-CRON-003 first; freshness labels already display honestly meanwhile | CRON-003 outcome |
| R2 | Migration 033 applied without backup proof or pre-review → unrecoverable schema mistake | High | Low (gated) | PITR reported false; hand-applied drifting history | MIGRATION-SAFETY runbook; GC-001 gate; written risk acceptance required | Any backup-status change |
| R3 | CI red at HEAD normalises ignoring CI | Medium | High (already true) | `tsc --noEmit` fails (TC-F1) | TASK-TEST-001 immediately | First push after fix |
| R4 | False local failures (worktrees) cause an agent to "fix" phantom breakage or skip validation | Medium | High | 62 false vitest fails, 2.5k false lint errors (TC-F2) | TASK-TEST-002; until then validate scoped suites only | After TEST-002 merges |
| R5 | Concurrent implementation agents clobber shared files | Medium | Medium | Conflict groups C1–C5; prior concurrent-session tree-wipe incident on record | Dependency-map lanes; one agent per lane; re-verify `git status` before/after each task | Any unexplained diff |
| R6 | Two-maths divergence surfaces publicly (screenshot of disagreeing totals) before STACK-001 lands | Medium | Medium | Divergence confirmed in code | Prioritised P1; Option B is one session | User report |
| R7 | Over-fetching the weekly-permissioned Point Hacks source strains source goodwill | Medium | Medium | 40h guard vs weekly contract (CRON-F1) | TASK-CRON-001; source currently default-off in prod which caps exposure | Source enablement |
| R8 | Stale operator docs cause a wrong production action (re-applying 027–032, assuming 033 applied) | High | Low-Medium | PROJECT_STATE self-contradiction | TASK-DOC-001 before the 033 pair | Doc merge |
| R9 | Legacy published rows (null expiry, 0%-typed, stale checks) erode trust while DS-001…007 wait | Medium | Medium | 2026-07-12 prod snapshot; not re-verified | Re-verify counts during GC-001's production read; DS tickets remain the fix vehicle | GC-001 findings |
| R10 | Programme docs themselves go stale (this audit's own failure mode, cf. R8) | Low | High | PROJECT_STATE precedent | Maintenance rule in TASK-INDEX.md; each completing session updates index+roadmap+map | Every task completion |
| R11 | e2e spec churn from three tasks (C3) creates flaky Playwright runs | Low | Medium | Single 808-line spec shared by 3 tasks | Sequence lane C; whole-spec run required in each task's validation | Flake observed |
| R12 | fast-check property tests flake in CI if seeds unpinned | Low | Low | TEST-003 introduces randomness | Task mandates pinned seed + bounded numRuns | First CI run after merge |

## Standing safety invariants (violating any is an automatic P0)
Approval boundary intact · default-off source gates intact · service-role/anon split intact · no demo data as live in configured production · no expired row on a public surface · no secret in logs or responses.

## Review cadence
Re-read this register at each wave boundary (MASTER-IMPROVEMENT-PROGRAMME waves) and after any incident handled via `docs/runbooks/`.
