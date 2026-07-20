# Manager–Worker Guide

> How to run this programme with one coordinating session ("manager") assigning task files to implementation agents ("workers" — Opus/Sonnet-class). Written 2026-07-20.

## Roles
- **Manager:** picks the next task per PRIORITY-ROADMAP + TASK-DEPENDENCY-MAP lanes, hands the worker exactly one task file, reviews the worker's report, updates programme docs, and owns anything marked human/approval-gated.
- **Worker:** executes one task file end-to-end using ONLY that file's Implementation-agent prompt as its brief. Workers never commit, push, migrate, deploy, publish, approve, enable sources, or touch env/secrets — the manager (a human, for production actions) does those.

## Assignment protocol
1. Choose the lane (A–D, H) and the next unstarted task in it; never assign two tasks from one conflict group (C1–C5) at the same time.
2. Give the worker the task file path and nothing else — the files are deliberately self-contained. If a worker needs more context, that's a defect in the task file; fix the file, then re-assign.
3. Environment facts workers need (include in the handoff): Node 20 (`nvm use 20`); repo root `/Users/mayank/Downloads/dealstack-au-clean`; until TASK-TEST-002 lands, run lint/vitest scoped (see that task) because stale `.claude/worktrees/` poison root runs; there is uncommitted in-flight work in `lib/` and `tests/` gift-card files — workers must preserve it and never `git checkout/stash` anything they didn't create.

## Worker contract (mirrors every task file's prompt)
Verify the issue still exists before editing → smallest complete change → tests with the change → run the task's Validation commands exactly → report: root cause, every changed file, commands run with outcomes, expectations updated (with justification), remaining risks/unverified items. If production access would be needed: stop and report. Honest failure beats silent success-claiming — a worker report that says "validation not run because X" is acceptable; one that claims green without running it is not.

## Manager review checklist per completed task
1. Diff review: only in-scope files; no boundary/gate/idiom violations; comment discipline per CLAUDE.md.
2. Re-run (or spot-run) the task's validation commands yourself — trust but verify.
3. Cross-file effects: did the change alter fixtures/expectations other lanes depend on? (Especially C1/C3 groups.)
4. Update TASK-INDEX.md status, and roadmap/dependency map if scope shifted (R10).
5. Commit with the checklist from CLAUDE.md (lint/typecheck/build/suites), then merge/push per the repo's normal flow. Batch small doc-only tasks if convenient.

## Human-gated items (never delegate)
- TASK-DB-001's migration apply (Gates B5–B8 in RELEASE-GATES.md).
- TASK-GC-001's review decisions (workers may prepare the comparison sheet; a human decides).
- Any secret entry/rotation, env flag change, source un-pause, or Vercel/GitHub settings change surfaced by TASK-CRON-003.

## Cadence and stopping rules
- One worker per lane; check in at wave boundaries (MASTER-IMPROVEMENT-PROGRAMME).
- Stop the programme and reassess if: any standing safety invariant (RISK-REGISTER) is violated; two workers report contradictory repo states (concurrent-session hazard — re-verify disk truth before continuing); or production observation (CRON-003) reveals the system materially differs from the audits' assumptions.

## Where everything lives
Tasks `tasks/<workstream>/` · audits `docs/audit/` · decisions `docs/decisions/` · runbooks `docs/runbooks/` · this programme `docs/programme/` · prior corpora `docs/backlog/DEALSTACK-BACKLOG.md`, `tasks/gift-card-automation/` (do not duplicate; re-verify any DS ticket against HEAD before executing it).
