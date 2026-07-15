# TASK-24 — GCDB recorded-permission gate parity

## Goal
Make the existing GCDB RSS route require a completed recorded robots and terms
review, matching the stricter Point Hacks adapter, while keeping every source
and environment gate disabled.

## Root cause
`app/api/cron/gift-card-ingest/route.ts` currently permits a fetch when
`enabled` and `automated_fetch_allowed` are true even if
`terms_checked_at`/`robots_checked_at` are null. TASK-01 and the programme
source policy require all four DB facts plus the environment gate.

## Scope
- Extract or reuse one pure retrieval-permission decision shared by GCDB and
  Point Hacks, without changing source-specific parsing.
- Return distinct machine-readable reasons for disabled, fetch-not-permitted,
  and permission-review-incomplete states.
- Add route and pure unit coverage for every gate, including proof of zero
  network work before all gates pass.
- Update `docs/gift-card-source-policy.md` only if code references need to be
  corrected; do not claim permission has been granted.

## Files likely involved
`app/api/cron/gift-card-ingest/route.ts`, a small module under
`lib/giftcards/`, `tests/giftcards/giftCardIngestRoute.test.ts`, and narrowly
related permission tests.

## Acceptance criteria
- GCDB cannot fetch with either review timestamp missing.
- Source disabled and source failure remain distinct states.
- `?force=1` bypasses neither permission nor environment gates.
- Point Hacks behaviour remains unchanged and all gates remain default-off.

## Safety
No migration apply, source enablement, production access, commit, push or
deployment.
