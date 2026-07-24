# Runbook — Migration safety

Production Supabase has a **hand-applied, historically drifting** migration history. This runbook is the guard rail; the authoritative ledger analysis is `docs/supabase-migration-ledger-reconciliation-2026-07-16.md`.

## Current position (as recorded 2026-07-22 — re-verify, don't trust)
- Ledger canonical through **037** (`verify:schema`: 37/37). Apply records in the ledger reconciliation doc: 027–032 on 2026-07-17; 033–035 on 2026-07-21; 036–037 on 2026-07-22.
- **033** (approval hardening) was APPLIED 2026-07-21. Its documented gate (a) review of the legacy active gift-card offers (`TASK-GC-001`), (b) explicit human approval (`TASK-DB-001`) was **not formally closed first**: the confirmed-only RLS now hides two legacy `needs-verification` offers (`gc-apple-points`, `gc-coles-group-bonus-points`) rather than deleting them. That legacy review is still OUTSTANDING — see the ledger doc's 033–035 side-effect note.
- **034/035** (purchase-limits columns + RPC) applied 2026-07-21. **036/037** (offer-expiry RLS: Sydney bound on cashback/points/weekly/signals, and card_offers realigned Melbourne→Sydney) applied 2026-07-22 — policy/column only, tightening or visibility-neutral. Every public offer table now bounds visibility by the Sydney expiry date.
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
