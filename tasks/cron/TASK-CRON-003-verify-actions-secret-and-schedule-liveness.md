# TASK-CRON-003 — Verify GitHub Actions CRON_SECRET and drive all scheduled workflows to green

## Status
Planned

## Priority
P1

## Workstream
CRON — scheduling & pipelines (operations; human-gated)

## Problem statement
Every scheduled trigger in this system lives in GitHub Actions and authenticates with the repository secret `CRON_SECRET`. Each workflow deliberately exits **2 (red)** when that secret is missing ("blind trigger must be red"). Evidence from 2026-07-13 (project memory / plan-backlog notes; DS-078) says the secret **did not exist** and monitor-health was red by design — meaning, until fixed, *none* of the scheduled monitoring or gift-card triggers actually reach production, and the ~60-day schedule auto-disable clock (documented in `monitor-health.yml`) is also in play.

This task is the production-observation checklist to establish and prove liveness. It is **human-gated**: it requires GitHub repo admin access and the Vercel `CRON_SECRET` value, which sensitive Vercel env pulls return as empty (`vercel env pull` shows `""` — the value is unrecoverable from tooling and must be re-entered or rotated by the owner).

Classification: Missing verification (the repo cannot prove its own schedules run). Umbrella ticket: DS-078.

## User impact
If triggers are dead: no scheduled monitor-health alerts (silent stall detection off), no gift-card ingest/lifecycle/reconcile runs once enabled, data freshness depends entirely on the daily Vercel crons and manual action.

## Evidence
- All 6 scheduled workflows in `.github/workflows/` gate on `secrets.CRON_SECRET` with `exit 2` when absent.
- `monitor-health.yml` header: schedule-disable-after-inactivity caveat; exit contract 0/1/2.
- Memory record 2026-07-13: secret missing; value unrecoverable from Vercel pulls; keychain `GH_TOKEN` works for `gh` CLI reads.
- DS-078 in `docs/backlog/DEALSTACK-BACKLOG.md`.

## Root cause or likely cause
The Actions secret was never created when the workflows were added; sensitive env values cannot be pulled back out of Vercel to automate it.

## Scope (operator checklist — read-only except the secret creation itself)
1. Read current state: `gh run list` per workflow — record last run, conclusion, and whether schedules are disabled.
2. Owner sets the `CRON_SECRET` repository Actions secret to the same value as the Vercel env var. If the value cannot be retrieved, **rotate**: generate a new secret, set it in Vercel (production env), redeploy, then set the same value in GitHub. (Rotation touches production env — explicit owner approval required; document in the run report.)
3. Manually `workflow_dispatch` monitor-health from main → expect green (HTTP 2xx path) or a *meaningful* red (503 = real stall/compliance issue → follow `docs/runbooks/PRODUCTION-HEALTH-CHECK.md`).
4. Manually dispatch each gift-card workflow → expect green with `skipped: environment-disabled` (their env flags are off) — this proves auth + reachability without enabling anything.
5. Confirm schedules are enabled (re-enable via the Actions UI if auto-disabled) and record the next scheduled run's conclusion.
6. Record outcomes in `docs/launch-management/PROJECT_STATE.md` (or its successor) with an as-of date.

## Out of scope
- Enabling any ingest/reconcile/lifecycle env flag or DB source row.
- Changing workflow YAML (TASK-CRON-002 owns that separately).
- Setting up cron-job.org (documented alternative; only if GitHub scheduling proves unreliable — decision stays with the owner).

## Relevant files
- `.github/workflows/*.yml` (read-only)
- `docs/runbooks/PRODUCTION-HEALTH-CHECK.md`, `docs/runbooks/CRON-FAILURE-RECOVERY.md`
- `docs/launch-management/PROJECT_STATE.md` (status recording)

## Data and schema considerations
None.

## Security considerations
- Never echo the secret into logs/PRs/chat. Set it only via the GitHub secrets UI or `gh secret set` reading from stdin.
- If rotated: old value invalid immediately after redeploy — sequence Vercel-then-GitHub within one sitting; the endpoints 401 in between (safe: they fail closed).

## Implementation plan
The scope list IS the plan; execute in order, recording each step's observed output (status codes and summary keys only — never response bodies).

## Required tests
None (no code). The "test" is the recorded green dispatch of each workflow.

## Validation commands
```bash
gh run list --workflow=monitor-health.yml --limit 5
gh run list --workflow=gift-card-lifecycle.yml --limit 5   # etc. per workflow
```

## Manual verification
A scheduled (not dispatched) monitor-health run completes green within 24h of the fix.

## Production safety
Steps 1, 3–6 are read-only against production (bearer-authenticated GETs to endpoints designed for it). Step 2 (secret set/rotate) changes production configuration → **owner approval required before executing**; an implementation agent without GitHub/Vercel access must stop at step 1 and report.

## Dependencies
None. Unblocks the value of: TASK-CRON-001/002 observation steps, DS-071/072/073/075, and all gift-card automation go-live plans.

## Parallelisation notes
No file conflicts with anything. Can run any time; requires a human.

## Rollback or recovery
Secret can be rotated again at will; nothing else changes.

## Acceptance criteria
- All six scheduled workflows show a green run (scheduled or dispatched) dated after the fix, with the gift-card ones showing `environment-disabled` skips.
- PROJECT_STATE (or successor) records the verified state with date.
- No secret value appears in any log or document.

## Definition of done
Criteria met and evidenced by run URLs/IDs in the report.

## Implementation-agent prompt

Implement this task as far as your access allows.

Before acting:
1. Read this entire task file and the workflow files.
2. Run the `gh run list` reads; if `gh` is unauthenticated or you lack repo access, STOP after recording that fact and report — do not attempt workarounds.

During execution:
- NEVER print or store the secret value. NEVER enable any source or env flag. Workflow dispatches of the gift-card endpoints are acceptable only because their env flags keep them no-op; verify the response says `environment-disabled` and report immediately if it does not.
- The secret set/rotate step requires explicit owner approval — request it and stop if not granted.
- Do not commit, push, migrate, or deploy (the PROJECT_STATE doc update may be prepared as a diff for the owner).

After execution:
- Report each workflow's run conclusion with run IDs, which steps required the owner, and anything left unverified.
