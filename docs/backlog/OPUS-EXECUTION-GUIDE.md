# Opus execution guide — DealStack AU backlog

> How to select and execute tickets from
> [DEALSTACK-BACKLOG.md](DEALSTACK-BACKLOG.md) /
> [DEALSTACK-BACKLOG.json](DEALSTACK-BACKLOG.json).
> This guide assumes you have already run the startup sequence in
> `docs/OPUS-4.8-START-PROMPT.md` at least once this session.

## The execution loop

1. **Verify the ticket's evidence.** Every ticket cites files, prod queries, docs
   or incidents. Open them. The backlog was written 2026-07-13 against
   `1d7b87a`; if the evidence no longer holds (file moved, row corrected,
   count changed), STOP and report the contradiction — do not "fix" the ticket
   silently or implement against stale claims.
2. **Confirm dependencies are complete.** Check `dependencies` in the JSON and
   the actual repo/prod state (a dependency merged but reverted is not
   complete). `blocked`/`future`/`needs-design` status means what it says.
3. **Inspect git and production state.** `git pull --rebase`, clean tree,
   `git log --oneline -5`. For data tickets: re-run the ticket's prod query
   read-only — counts move.
4. **Restate scope in one paragraph** — what will change, what will NOT
   (the ticket's `outOfScope` line is binding), which files, which tests.
5. **Implement only the selected ticket** (or the iteration's tickets, in its
   listed order). Match existing patterns — this repo prefers pure,
   dependency-injected helpers with the I/O at the edges.
6. **Run the ticket's focused tests** (`testRequirements`) as you go.
7. **Run the required gates** (`validation` commands, Node 20). For anything
   touching product source: `npm run lint`, `npx tsc --noEmit`,
   `npx vitest run`, `npm run build`; add `npm run test:e2e` for public UX and
   `git diff --check` always.
8. **Update ticket status and evidence.** Edit BOTH backlog files
   (`status`, and append an `outcome` note with commit sha / prod evidence to
   the markdown entry). The two files must not diverge — if you change one,
   change the other in the same commit.
9. **Stop before any production or migration action.** `productionApprovalRequired:
   true` means the ticket has a hard human gate: present the exact SQL /
   row-level change / flag flip and wait. Approval for one row or one migration
   is not approval for the next.
10. **Never silently expand scope.** Adjacent bugs you discover become new
    backlog entries (or a report), not drive-by fixes in the same diff.

## Standing safety rules (repeated because they are absolute)

- No migration applies, RLS changes, production data writes, feature-flag or
  source-gate flips without explicit approval for that specific action.
- Production data corrections go through the audited admin edit UI, never raw SQL.
- Nothing external auto-publishes; staging tables stay service-role-only.
- RSS/Atom only; no HTML scraping; identifying User-Agent; Vercel crons stay daily.
- Do not touch `app/layout.tsx` or `app/globals.css`. Australian spelling in copy.
- Node 20 for everything except `npm run seed` and `verify:schema` (Node 22).
- Commit/push only after the gate is green; routine git to `origin/main` is
  autonomous once the work itself was approved.

## Choosing what to run

- Default order is the roadmap's iteration order (IT-01 first — see
  [RELEASE-ROADMAP.md](RELEASE-ROADMAP.md)).
- `agentReadiness` field: **Codex-ready** tickets are safe to delegate;
  **Opus-design** tickets need you; **Human-gated** tickets need the user
  before or during execution — schedule them when the user is available.
- Within an iteration, respect `sequentialAfter`; tickets in the
  DEPENDENCY-GRAPH parallel workstreams may interleave.
- Do not start an iteration whose `prerequisites` (JSON) are unmet, and do not
  mix tickets from two migration-bearing iterations in one branch.

## Copy-paste ticket prompt

```
Execute backlog ticket DS-XXX from docs/backlog/DEALSTACK-BACKLOG.md.
Before editing:
- verify its evidence and dependencies
- inspect current git state
- report contradictions
- confirm whether approval is required
Implement only this ticket and its explicitly listed dependencies.
Run the ticket's validation commands.
Do not commit, push, migrate, enable flags, or modify production unless I
explicitly instruct you.
```

For a whole iteration, replace the first line with:
`Execute iteration IT-XX from docs/backlog/RELEASE-ROADMAP.md, tickets in listed order, stopping at the iteration's stop condition.`
