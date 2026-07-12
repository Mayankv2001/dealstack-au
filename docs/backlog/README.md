# DealStack AU — Backlog directory

> Created 2026-07-13 as part of the Opus 4.8 handoff. Ticket evidence was
> verified against code state `1d7b87a`; local HEAD is `54a60a2` (docs-only
> handoff commit, unpushed). **Worktree caveat:** uncommitted approval-safeguard
> work (compound/membership/threshold checks in `approvalValidation.ts` and the
> review UI, plus two new test files) exists in the tree and overlaps DS-012 /
> DS-017 — reconcile it before executing those tickets. Every ticket is grounded in repository code,
> verified production state (read-only probes 2026-07-12/13), documentation,
> tests, migration status, or a recorded incident — there are no filler
> tickets, and notably **zero TODO/FIXME/HACK comments exist in the codebase**
> (grep-verified), so nothing here is comment-driven.

## Files

| File | What it is |
|---|---|
| [DEALSTACK-BACKLOG.md](DEALSTACK-BACKLOG.md) | Human-readable source of truth: 108 tickets, full schema, grouped by epic |
| [DEALSTACK-BACKLOG.json](DEALSTACK-BACKLOG.json) | Machine-readable twin (same tickets + iterations + milestones); validated |
| [RELEASE-ROADMAP.md](RELEASE-ROADMAP.md) | 20 iterations → 4 milestones, focused top-10 lists, first-iteration recommendation |
| [DEPENDENCY-GRAPH.md](DEPENDENCY-GRAPH.md) | Mermaid + plain-text dependency graph, critical path, blockers, parallel workstreams |
| [OPUS-EXECUTION-GUIDE.md](OPUS-EXECUTION-GUIDE.md) | How an agent selects, executes, validates and closes a ticket; copy-paste prompt |

## Numbers

- **108 tickets** across **15 epics** (A gift-card data accuracy … O growth), **20 iterations**, **4 milestones**.
- Priority: 0 × P0, 20 × P1, 61 × P2, 27 × P3. (No P0: the priority model's P0 conditions are currently mitigated by shipped controls; the P1 set keeps them that way.)
- Effort: 8 × XS, 45 × S, 43 × M, 11 × L, 1 × XL (DS-105, with decomposition).
- Readiness: 61 Codex-ready, 25 Opus-design, 22 Human-gated.
- 33 tickets require explicit production/migration approval; they are listed in the roadmap and flagged per-ticket.

## Maintenance rules

1. The **markdown and JSON must stay in sync** — update both in the same commit
   (ticket status changes included).
2. Closing a ticket: set `status`, append an outcome note (commit sha, prod
   evidence) in the MD entry.
3. New tickets: next free `DS-1xx` id, full schema, evidence required, and add
   them to an iteration (or a new one) — the JSON's iteration coverage is
   validated by construction and should stay total.
4. Re-verify counts (published offers, queue depth) against production before
   acting on any data ticket — they were true on 2026-07-13 and will drift.
5. This backlog complements, not replaces, `docs/OPUS-4.8-HANDOFF.md` (state)
   and `docs/DEALSTACK-DECISIONS.md` (why). Read those first.
