# TASK-DB-001 — Apply migration 033 (approval/publication hardening) to production — GATED

## Status
Done — migration 033 confirmed applied in production. Verified 2026-07-22 via Supabase `list_migrations` on project `numgsivlrglflsnqehac` (033/034/035 all present).

## Priority
P1

## Workstream
DB — database & migrations (human-gated)

## Problem statement
Migration `supabase/migrations/033_gift_card_offer_approval_hardening.sql` is the final piece of the gift-card approval-boundary hardening: it replaces `approve_gift_card_candidate` with a version that serialises per-offer via a transaction advisory lock, locks candidate + canonical rows, and restricts what changed-vs-new candidates may write. It is written, reviewed, and dependency-complete (031/032 applied 2026-07-17 per `docs/gift-card-migration-028-030.md` and PROJECT_STATE §5) — but not applied. Until it is, the production approve path runs the older, less-serialised RPC.

Classification: Missing production apply (deliberately gated; this task encodes the gate rather than urging speed).

## User impact
Indirect: hardening prevents concurrent-approval races and constrained-field violations that could publish a malformed or duplicate offer.

## Evidence
- `docs/gift-card-migration-033-approval-hardening.md` (design, prerequisites, expected behaviour changes).
- `docs/launch-management/PROJECT_STATE.md` §5 ("ledger canonical through 032… 033 remains gated") and the legacy-review gate (~line 102).
- `docs/supabase-migration-ledger-reconciliation-2026-07-16.md` (ledger process; note it predates the 2026-07-17 applies).
- Memory/prior state: PITR/backup posture was historically unproven — the 028–030 apply used "a verified logical backup" (its doc header); replicate that bar.

## Root cause or likely cause
n/a — planned, gated work.

## Scope (owner-approved production session)
1. Confirm gates: TASK-GC-001 complete; owner approval recorded; `npm run verify:schema` current view of prod.
2. Take/verify a logical backup of the affected objects (at minimum: `gift_card_offers`, `gift_card_offer_candidates`, the RPC definitions) — same bar as the 028–030 rollout; record how restore would work.
3. Apply 033 in one reviewed transaction via the established path (`npm run migration:rollout` checklist / `scripts/migration-rollout.ts`, or the documented manual psql path in the migration doc).
4. Post-apply probes (read-only): `information_schema` for the RPC definition change; offers-hash unchanged (handoff §M recipe — data untouched); one dry approval attempt on a **test/staging candidate is not available in prod, so instead** verify by `EXPLAIN`-free inspection only — do NOT approve anything as a "test".
5. Regenerate types + schema manifest in the same commit (`npm run types:gen`, `scripts/schema-manifest.ts`) and update the three status docs (033 doc header, PROJECT_STATE §5, TASK-DOC-001's cleaned state).

## Out of scope
- Any data edits (TASK-GC-001 already done by gate).
- Migrations beyond 033; RLS changes (033 has none per its doc — verify while reading).

## Relevant files
- `supabase/migrations/033_gift_card_offer_approval_hardening.sql`
- `scripts/migration-rollout.ts`, `scripts/schema-manifest.ts`, `scripts/verify-schema.ts`
- `lib/supabase/database.types.ts` (regenerate)
- Docs listed above

## Data and schema considerations
RPC replacement with unchanged signature: application code needs no change (verify `lib/admin/repos/giftCardPipeline.ts` call sites while reading). In-file rollback notes follow the 022 pattern — confirm they exist before applying; if absent, write them first and have them reviewed.

## Security considerations
Strengthens the approval boundary. Apply with the service-role/owner connection only; never from application runtime. No secrets in logs.

## Implementation plan
The scope list is the plan; each step's output recorded in the rollout report.

## Required tests
- Pre-merge (repo side): `tests/admin/schemaManifest.test.ts` and full `npm run test:giftcards` against the updated types/manifest.
- DS-086 (approve-RPC contract integration tests) is the durable follow-up — note in report if still open.

## Validation commands
```bash
npm run verify:schema      # before and after
npm run lint && npx tsc --noEmit && npx vitest run tests && npm run build
npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content
```

## Manual verification
Post-apply `information_schema.routines` probe shows the new definition; offers table hash unchanged; admin approve flow exercised on the next *real* reviewed candidate (not a synthetic test) with the operator watching.

## Production safety
**Never auto-apply.** This task must not be executed by an implementation agent end-to-end: the agent may prepare (read the migration, verify rollback notes, pre-stage type/manifest/doc diffs); the APPLY step requires the owner running it with the backup verified. If backup verification fails, stop — that becomes the blocking task (risk acceptance is the owner's written call, per RELEASE-GATES).

## Dependencies
Blocked by TASK-GC-001. Blocks: DS-086's value, full approval-hardening claims in docs.

## Parallelisation notes
Nothing else may touch the DB during the apply window. Repo-side prep conflicts with nothing.

## Rollback or recovery
In-file rollback notes (restore prior RPC definition — the 022-pattern header); logical backup as the backstop. Application code is unchanged either way, so rollback is a pure DB operation.

## Acceptance criteria
- 033 recorded in the prod ledger; probes pass; offers data hash unchanged; types + manifest + docs updated in one commit; rollback path written and reviewed before apply.

## Definition of done
Criteria met; rollout report includes backup evidence reference, probe outputs, and the ledger row.

## Implementation-agent prompt

Prepare — do not apply — this migration.

Before acting:
1. Read this entire task file, the 033 SQL and its design doc, and `scripts/migration-rollout.ts`.
2. Verify gates: TASK-GC-001 recorded complete; 031/032 applied; if either fails, stop and report.
3. Check `git status`; preserve unrelated work.

During preparation:
- Verify the migration file contains in-file rollback notes (write them if missing — repo-only change).
- Pre-stage the types regeneration, schema-manifest update and doc edits as an unpushed diff.
- Do NOT run the migration, do NOT connect to production with write intent, do NOT approve/publish anything. If any step would require production access, stop and report exactly what the owner must run.

After preparation:
- Report the readiness checklist (each gate: pass/fail/blocked), the staged diff summary, and the exact commands the owner will run.
