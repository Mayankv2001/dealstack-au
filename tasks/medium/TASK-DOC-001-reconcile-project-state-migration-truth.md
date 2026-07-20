# TASK-DOC-001 — Make PROJECT_STATE.md tell one truth about migrations 027–033

## Status
Planned

## Priority
P1

## Workstream
DOC — operator truth

## Problem statement
`docs/launch-management/PROJECT_STATE.md` contradicts itself about which migrations are applied to production:

- Line ~5 (header): "027–033 written, reviewed and **awaiting the gated production apply**".
- §platform (line ~35): "Migrations 021–026 are applied to prod; **027–033 are written and reviewed but NOT applied**".
- §5 (line ~92): "The production migration ledger is canonical through 032. Migrations 027–032 [applied] … Migration 033 remains gated".

The §5 statement matches `docs/gift-card-migration-028-030.md` (applied 2026-07-17) and `docs/supabase-migration-ledger-reconciliation-2026-07-16.md`. The header and §platform are stale. This is the exact operator-truth failure DS-011 was raised to prevent, recurring inside the fix's own document.

Classification: Confirmed defect (documentation, operationally hazardous).

## User impact
None directly — but an operator or agent deciding whether the approval RPC has the 033 hardening, or whether 027–032 need applying, can act on the false half. Wrongly re-applying migrations or wrongly assuming hardening exists both have production consequences.

## Evidence
- `docs/launch-management/PROJECT_STATE.md` lines ~5, ~35, ~92-104 (quoted above; verify with `grep -n "027\|033" docs/launch-management/PROJECT_STATE.md`).
- `docs/gift-card-migration-028-030.md`; `docs/supabase-migration-ledger-reconciliation-2026-07-16.md`.
- Cross-refs: `docs/audit/CURRENT-STATE-AUDIT.md` finding 3; `docs/audit/ADMIN-OPERATIONS-AUDIT.md` ADM-F1.

## Root cause or likely cause
§5 was updated when 027–032 were applied (2026-07-17); the header and platform summary were not.

## Scope
- Correct the header and §platform to the §5 truth: canonical through 032; 033 written/reviewed, apply gated; the 10-legacy-offer pre-review (TASK-GC-001) is the open prerequisite.
- Add one "single source of truth" sentence to PROJECT_STATE pointing migration-state questions at §5 + the ledger reconciliation doc, so future partial updates fail less badly.
- Sweep the same file for any other statement keyed to the stale claim (search "NOT applied", "027").
- Do NOT touch the migration docs themselves; they are correct.

## Out of scope
- Applying anything (TASK-DB-001, gated).
- Restructuring PROJECT_STATE.

## Relevant files
- `docs/launch-management/PROJECT_STATE.md` only.

## Data and schema considerations
None — documentation. But the corrected text MUST match the ledger reconciliation doc exactly; if the implementer finds those two disagree, stop and report rather than pick one.

## Security considerations
None.

## Implementation plan
1. Re-verify the three contradictory passages still exist.
2. Correct header + §platform; add the pointer sentence; sweep.
3. Read the whole file once after editing for internal consistency.

## Required tests
None (documentation). Validation is the consistency sweep.

## Validation commands
```bash
grep -n "027\|032\|033\|NOT applied" docs/launch-management/PROJECT_STATE.md
```
Every hit must state the same ledger position.

## Manual verification
Read the full file top to bottom once; no remaining contradiction.

## Production safety
Documentation-only.

## Dependencies
None. Blocks clean execution of TASK-GC-001/TASK-DB-001 in the sense that their operators read this file first — run this before them.

## Parallelisation notes
Fully independent; safe alongside everything.

## Rollback or recovery
Revert commit.

## Acceptance criteria
- One consistent migration-state story across the entire file, matching the ledger reconciliation doc; pointer sentence added.

## Definition of done
Criteria met; grep output included in the report.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this task, then ALL of `docs/launch-management/PROJECT_STATE.md`, `docs/gift-card-migration-028-030.md`, and `docs/supabase-migration-ledger-reconciliation-2026-07-16.md`.
2. Verify the contradiction still exists; if the file was already corrected, stop and report.
3. Check `git status`; preserve unrelated work.

During implementation:
- Documentation edits only, in this one file; align to the ledger reconciliation doc; if sources disagree with each other, stop and report — do not adjudicate.
- Do not commit, push, migrate, or deploy.

After implementation:
- Run the grep validation; read the file end to end.
- Report every passage changed (before/after) and confirm no other file was touched.
