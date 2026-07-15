# TASK-30 — Migration-ledger documentation reconciliation

## Goal
Make all TASK-01–07 programme and migration documents agree with the repository's
latest read-only production evidence before any migration approval decision.

## Root cause
The programme plan and 028–030 design doc say 023–027 are unapplied and should
run in numeric order. The later 031 design records read-only production probes
showing 023–026 applied, 027–030 unapplied, and a fixed-points drift that requires
031 first. Contradictory operator instructions are unsafe.

## Scope
- Treat `docs/gift-card-migration-031-fixed-points.md` as the latest recorded
  production observation, while labelling it as evidence that must be re-probed
  at the approval gate.
- Update the programme plan, migration 023 header status, 028–030 design doc
  and any schema-manifest comments that make contradictory apply claims.
- Distinguish fresh-replay numeric order from the current production recovery
  order; never suggest re-running an applied migration.
- Preserve the explicit user-approval, types regeneration and schema-verification
  gates. Do not execute any probe or DDL.

## Acceptance criteria
- No repository document says both applied and unapplied for the same known
  production migration as of the same recorded date.
- Current-production and clean-environment sequences are both explicit.
- Migration 028 remains marked unapplied/unverified outside production.
- The approval runbook requires a fresh ledger/information-schema probe.

## Safety
No production connection, migration apply, commit, push, deploy or source
enablement.
