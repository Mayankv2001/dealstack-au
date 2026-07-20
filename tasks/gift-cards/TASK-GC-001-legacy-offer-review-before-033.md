# TASK-GC-001 — Review the 10 active legacy gift-card offers before applying migration 033

## Status
Planned

## Priority
P1

## Workstream
GC — gift-card accuracy (human-gated; admin/owner work)

## Problem statement
Migration 033 (approval/publication hardening) is written and reviewed but deliberately **not applied**, because its stricter visibility/approval rules are expected to change how some legacy rows behave. `docs/launch-management/PROJECT_STATE.md` next-steps records the gate explicitly: *"Review the 10 active legacy gift-card offers before migration 033. … Do not apply 033 until its expected visibility changes are reviewed."* No task file existed for this review until now, so the prerequisite has no owner and TASK-DB-001 (the apply) is silently blocked.

Classification: Missing verification / human-gated data review (the gate itself is documented fact).

## User impact
Until 033 lands, the approve RPC lacks its advisory-lock serialisation and field-update restrictions; until this review happens, 033 cannot land. Meanwhile several of the 10 legacy rows are the same ones carrying known accuracy defects (DS-001…DS-006 shapes: null expiry, mis-typed mechanics, sample prose).

## Evidence
- `docs/launch-management/PROJECT_STATE.md` (~line 102) — the quoted gate.
- `docs/gift-card-migration-033-approval-hardening.md` — expected behaviour changes and prerequisites (must follow 031/032, which are applied per `docs/gift-card-migration-028-030.md` and PROJECT_STATE §5).
- `docs/gift-card-offer-corrections-2026-07-12.md` — per-row known defects.
- Overlap: DS-001…DS-007 (row re-verification tickets) — this review should be executed **together with** those where rows coincide, in one audited admin session.

## Root cause or likely cause
Legacy rows predate the accuracy model; 033's hardened rules were designed against the pipeline-shaped rows.

## Scope (admin session, production, audited, reversible)
1. Enumerate the 10 active legacy offers (read-only SELECT or the admin list — the corrections doc identifies them).
2. For each: predict its state under 033's rules (using the migration doc's behaviour table); re-verify at its cited source; then via the audited admin edit UI either correct (expiry, mechanic type, prose, citation), unpublish, or explicitly accept the post-033 behaviour.
3. Record per-row outcomes in `docs/gift-card-offer-corrections-2026-07-12.md` (status column / addendum) with dates.
4. Declare the gate satisfied in PROJECT_STATE (or successor) so TASK-DB-001 can proceed.

## Out of scope
- Applying 033 (TASK-DB-001).
- Schema changes; queue candidates (DS-007); compound-row splitting (DS-021).

## Relevant files
- `docs/gift-card-offer-corrections-2026-07-12.md`, `docs/gift-card-migration-033-approval-hardening.md`, `docs/launch-management/PROJECT_STATE.md`
- Admin UI: `app/admin/(protected)/gift-cards/[id]/edit/page.tsx`
- Reference logic: `lib/giftcards/approvalValidation.ts`, `lib/giftcards/dateState.ts`

## Data and schema considerations
Production data edits via the existing audited admin path only. No direct SQL writes. `audit_log` preserves prior values (rollback path).

## Security considerations
Requires an allowlisted admin account. No secrets involved.

## Implementation plan
The scope list is the plan. One sitting is strongly preferred (consistent as-of date).

## Required tests
None (data review). `npm run test:giftcards` as a regression guard if any code-adjacent doc/fixture is touched.

## Validation commands
```bash
npm run smoke -- --base-url=https://dealstack-au.vercel.app --strict-content   # after edits
```

## Manual verification
Each row verified at its source URL on the day of editing; note or screenshot the stated terms before saving (matches DS-001's evidence bar).

## Production safety
Every change goes through the audited, rate-limited admin UI; unpublish is reversible; no source gates, env, or schema touched. **This task changes production data and therefore requires the owner/admin to execute or approve each edit.** An implementation agent without admin access must stop at step 1 (enumeration + per-row 033 prediction) and hand over a prepared worksheet.

## Dependencies
Blocked by: none. Blocks: TASK-DB-001. Coordinate with DS-001…DS-007 (same rows; do them together).

## Parallelisation notes
No repo-file conflicts (docs only). Must not run concurrently with another admin bulk-editing gift-card rows.

## Rollback or recovery
`audit_log` rows per edit; unpublish reversible via the same UI.

## Acceptance criteria
- All 10 rows have a recorded decision (corrected / unpublished / accepted-as-is-under-033) with dates and source evidence.
- Corrections doc updated; PROJECT_STATE gate marked satisfied.
- Zero rows left where 033's behaviour change would be a surprise.

## Definition of done
Criteria met; the worksheet (row → prediction → decision → evidence) attached to the report.

## Implementation-agent prompt

Execute this task as far as your access allows.

Before acting:
1. Read this entire task file, the 033 migration doc, and the corrections doc.
2. Verify the gate is still open (PROJECT_STATE; if 033 is already applied, stop and report).
3. Build the 10-row worksheet with each row's predicted post-033 behaviour — this part is repo-only and always in scope.

During execution:
- Production edits ONLY via the audited admin UI and ONLY with explicit owner approval / owner at the keyboard. Never guess a term — unverifiable stays null or the row is unpublished.
- Do not apply migrations, change env, enable sources, or publish anything that was not explicitly approved in review.
- Do not commit or push except the corrections-doc/PROJECT_STATE updates, and only if asked.

After execution:
- Report per-row outcomes, what remains unresolved, and confirm whether TASK-DB-001's gate is now satisfied.
