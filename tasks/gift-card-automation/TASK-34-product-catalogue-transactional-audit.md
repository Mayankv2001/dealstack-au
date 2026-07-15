# TASK-34 — Product-catalogue transactional audit boundary

## Goal
Close TASK-07's requirement that every product-catalogue write is audited in
the same database transaction as the mutation.

## Root cause
The admin create/update actions currently mutate `gift_card_products` through
PostgREST and then call `logAudit`. The seed script uses a compensating delete.
Both surface audit failure, but neither proves mutation and audit atomicity.

## Scope
- Add reviewed, service-role-only `SECURITY DEFINER` create/update RPCs to the
  still-unapplied product-catalogue migration lineage.
- Lock update targets, validate evidence shape and HTTPS URLs, mutate the
  product, and insert `audit_log` in one transaction.
- Route admin create/edit and `--write` seed calls through those RPCs.
- Missing schema must fail closed with no direct-write fallback.
- Preserve dry-run behaviour and inactive-by-default publication state.

## Required tests
Auth/rate-limit; missing migration; mutation failure; audit failure rollback;
inactive insert; evidence preservation; concurrent insert idempotency; dry run
performs no write.

## Safety
Do not apply migrations, run the seed with `--write`, commit, push, deploy, or
change production data.
