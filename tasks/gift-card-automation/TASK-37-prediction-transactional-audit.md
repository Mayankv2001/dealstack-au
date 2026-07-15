# TASK-37 — Prediction capture/review transactional audit boundary

## Goal
Make TASK-06 private prediction capture and outcome review atomic, audited and
strictly linked only to confirmed canonical offers.

## Root cause
Current PostgREST insert/update calls are followed by separate `audit_log`
writes. Audit failure can leave a private mutation behind, and manual outcome
review accepts any existing offer id rather than proving confirmed status.

## Scope
- Add service-role-only `SECURITY DEFINER` RPCs to the unapplied 029 lineage for
  insert-only batch capture and outcome review.
- Make the SQL fingerprint's date serialization explicitly ISO and independent
  of PostgreSQL `DateStyle`, while remaining byte-aligned with the TypeScript
  fingerprint for null and concrete dates.
- A replay may force the disabled source gates closed but must preserve any
  later `terms_checked_at` / `robots_checked_at` review evidence.
- Lock reviewed rows, preserve original facts, validate source/fingerprint and
  canonical URL, enforce idempotency, and insert audit rows transactionally.
- Matched/partial outcomes may link only an existing confirmed offer; missed
  outcomes must not link.
- Route admin capture, admin review and reconciliation writes through the RPCs.
- Missing schema remains a controlled no-write result.

## Required tests
Audit failure rollback; exact recapture; concurrent recapture; immutable facts;
SQL/TypeScript fingerprint parity under non-ISO `DateStyle`; source-review
timestamps preserved on replay; unconfirmed/missing offer link rejected;
missed-with-link rejected; auth/rate limit; no public write/import; missing
schema.

## Safety
Do not apply migrations, commit, push, deploy, enable sources, or change
production data.
