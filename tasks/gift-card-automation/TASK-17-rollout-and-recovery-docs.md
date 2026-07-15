# TASK-17 — Rollout and recovery documentation

## Goal
Operator-grade runbook for the staged rollout (12 stages, plan §14) and for
recovery from every failure mode — no step executed, only documented.

## Scope
- `docs/gift-card-automation-rollout.md`: the 12 rollout stages verbatim from
  plan §14, each with: preconditions, exact commands/SQL (marked
  approval-gated), verification queries (`information_schema`, run-registry
  selects, health-route curl), success criteria, and per-stage rollback.
  Includes the migration apply order (023→030), `npm run types:gen` +
  `verify:schema` after each apply, and the gate-opening/closing procedure
  (the documented 2026-07-12 pattern).
- `docs/gift-card-automation-recovery.md`: recovery procedures for — stuck
  `running` run; duplicate local-day run; parse failure after source HTML
  drift (fixture refresh procedure); wrongly approved revision (audit-based
  reversal via admin edit); acceptance mis-merge (split procedure); DST
  transition checklist (next: 2026-10-04); source withdrawal handling;
  restoring an archived offer; what to do when `expired_still_visible` > 0.
- Update `docs/gift-card-pipeline.md` stale line (021 "not yet applied") and
  add pointers to the new docs; update `.env.example` comments for the new
  flags if TASK-05 didn't.
- Cross-check every command against the actual code/routes (no invented
  flags, paths, or SQL).

## Files likely involved
`docs/gift-card-automation-rollout.md` (new),
`docs/gift-card-automation-recovery.md` (new), `docs/gift-card-pipeline.md`,
`.env.example`.

## Dependencies
All functional tasks (documents their real shapes). Wave 5, last.

## Inputs
Plan §5/§13/§14/§16; `docs/OPUS-4.8-HANDOFF.md` §M operational recipes;
final merged code.

## Exact deliverables
Two new docs + stale-doc fix. Documentation only.

## Constraints
- Every command verified against the repo (grep the route/flag/script names).
- Every stage marked with its approval gate; no doc may instruct enabling
  automation without user sign-off language.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
None (docs). `npm run lint` unaffected.

## Acceptance criteria
An operator can execute stage-by-stage without reading source; recovery doc
covers all listed failure modes; no invented commands.

## Commands to validate
`nvm use 20 && npm run lint`

## Non-goals
Executing any stage; enabling any gate; applying any migration.
