# Runbook — Migration safety

Production Supabase has a **hand-applied, historically drifting** migration history. This runbook is the guard rail; the authoritative ledger analysis is `docs/supabase-migration-ledger-reconciliation-2026-07-16.md`.

## Current position (as recorded 2026-07-19 — re-verify, don't trust)
- Ledger canonical through **032** (027–032 applied 2026-07-17 per `docs/gift-card-migration-028-030.md`).
- **033** (approval hardening) written and reviewed, apply **gated** on: (a) review of the 10 active legacy gift-card offers (`tasks/gift-cards/TASK-GC-001`), (b) explicit human approval (`tasks/database/TASK-DB-001`).
- Backups: PITR has been reported FALSE; treat backups as unproven. Any migration is apply-forward-only until a backup is demonstrated restorable.
- Known historical trap: prod's 025 predates `fixed_points`, so 031 was extended to the occurrences table — hand-applied history means file-order intuition is unreliable.

## Before ANY apply (read-only verification)
1. Read the target migration file end-to-end and its companion doc (`docs/gift-card-migration-*.md`).
2. Verify actual prod schema state via `information_schema` queries (columns/constraints the migration assumes and creates) — never infer from the ledger alone.
3. `npm run verify:schema` against the manifest; check `schema-drift.yml` is green.
4. Confirm the migration is transaction-wrapped, non-destructive (no DROP/data-rewrite without an explicit approved plan), `SECURITY DEFINER` functions pin `search_path` (repo convention since 008/013), and any `NOT VALID` constraint has a scheduled VALIDATE follow-up.
5. Write down the rollback story BEFORE applying. If the honest answer is "restore from backup" and backups are unproven, the apply needs explicit risk acceptance from the owner — in writing.

## Applying (approval-gated, human at the keyboard)
- One migration at a time, inside a transaction, via the Supabase SQL editor or MCP `apply_migration` — never a script that batches several.
- Immediately after: re-run the `information_schema` verification for every object the migration creates/alters; run `npm run verify:schema`; regenerate types if schema-visible (`lib/supabase/database.types.ts`) and check for drift.
- Record the apply (what/when/who/verification output) in the ledger reconciliation doc and update `docs/launch-management/PROJECT_STATE.md` §5 — header AND platform section (see TASK-DOC-001 for why both).

## Never casually
- `DROP`, `TRUNCATE`, destructive backfills, RLS/policy changes (CLAUDE.md: explain-first), or GRANT changes.
- Applying while any related cron job is mid-run (check run ledgers; pause the affected jobs for structural changes to their tables).
- "Fixing" drift by editing history — reconcile forward, document reality.

## If an apply goes wrong mid-way
- Transaction-wrapped: it rolled back — verify with `information_schema`, then stop and diagnose; do not immediately retry.
- Not transaction-wrapped (should not happen — see Before #4): map exactly which statements landed via `information_schema`, write a forward-fix migration; do NOT hand-revert objects ad hoc.

## Validation after
Schema manifest green, types drift-free, affected app paths exercised (`npm run test:admin` / relevant suites), affected cron jobs' next runs green, PROJECT_STATE + ledger doc updated.

## Escalation
DB owner / approver: (fill in). Backup status owner: (fill in).
