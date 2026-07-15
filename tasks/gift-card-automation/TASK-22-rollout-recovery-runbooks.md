# TASK-22 — Final rollout and recovery runbooks

## Goal
Produce operator-grade, repository-verified rollout and recovery documentation
after functional integration is final.

## Root cause
TASK-17 exists but its two required documents do not.

## Scope
- Implement TASK-17 using the final real route/env/RPC names.
- Document migration order 023→031 (including why 031 follows 030), type/schema
  regeneration, closed source gates, dry-run/admin-assisted verification,
  health checks, controlled gate opening and rollback.
- Cover stuck locks, duplicate local day, source/parse failure, bad revision,
  acceptance mis-merge, DST transition, withdrawal, restore and
  `expired_still_visible` recovery.

## Dependencies
All functional remediation and TASK-15 health route.

## Files likely involved
`docs/gift-card-automation-rollout.md`,
`docs/gift-card-automation-recovery.md`, `docs/gift-card-pipeline.md`,
`.env.example` comments.

## Exact deliverables
Two complete runbooks and corrected cross-links/stale migration statements.

## Required tests
Documentation command/path audit using `rg`; lint and `git diff --check`.

## Acceptance criteria
Every command, route, flag, table and RPC exists in the final repository; each
state-changing step is explicitly approval-gated and includes recovery.

## Validation commands
`nvm use 20 && npm run lint && git diff --check`

## Non-goals
Executing rollout, enabling flags, applying migrations, production smoke tests.

## Safety
Do not commit, push, deploy, apply migrations, enable jobs, or change
production data.
