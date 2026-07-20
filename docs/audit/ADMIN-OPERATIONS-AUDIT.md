# Admin & Operations Audit

> Audit date: 2026-07-19 · HEAD `9b7365f` · Read-only.

## Surface

30+ protected pages under `app/admin/(protected)/`: dashboard, signals (+queue, sources), offer-changes (+detection preview), monitor, cleanup, compliance, audit, card-offers/reports, cashback, points, stores, weekly-deals, and the gift-card suite (list/edit/new, review, predictions, acceptance, intelligence). Data access via `lib/admin/repos/*` (31 modules, service-role isolated).

## Verified controls

- **Auth layering:** `proxy.ts` is an optimistic session gate only; the real allowlist check is `requireAdmin()` at the data layer (`lib/admin/auth.ts`) — a matcher change cannot silently drop authorization. Login is magic-link via Supabase Auth; admins are hand-created (docs/launch-management).
- **Rate limiting:** Postgres RPC with advisory transaction lock, per-admin-email, 30/min (`lib/admin/rate-limit.ts`). FAIL-OPEN by documented choice (availability over throttling for trusted admins). Bulk actions consume one unit per batch, capped at 200 (memory + `AdminListTable` `bulk` prop, commit `4c60580`).
- **Approval boundary:** nothing in monitor/cron code writes to `ozbargain_signals` or publishes; gift-card approve path goes through `approve_gift_card_candidate` RPC with validation (`lib/giftcards/approvalValidation.ts`, `approvalSafeguards.ts`, `publishReadiness.ts`); duplicate detection (`duplicateDetection.ts`) feeds the review UI.
- **Audit:** transactional admin audit (migration 011) with per-domain transactional-audit closeouts (gift-card review/prediction/acceptance/product actions — tasks 34/37/38/39 in `tasks/gift-card-automation/`).
- **Job visibility:** `/admin/monitor` + `giftCardJobRuns` repos expose run ledgers; schema-unavailable errors surface as controlled 503s (`giftCardJobRunErrors.ts`).

## Findings

### ADM-F1 — Operator truth documents are stale/contradictory *(Confirmed → TASK-DOC-001)*
PROJECT_STATE.md contradicts itself about migrations 027–033 (see CURRENT-STATE finding 3). For an admin deciding whether the approval RPC has the 033 hardening, this is an operational hazard, not just a doc nit.

### ADM-F2 — The 033 pre-apply review of 10 legacy offers is unassigned *(Human-gated → TASK-GC-001)*
PROJECT_STATE next-steps: "Review the 10 active legacy gift-card offers before migration 033… Do not apply 033 until its expected visibility changes are reviewed." No task file existed for it until now.

### ADM-F3 — Scheduled-ops liveness unknown *(Missing verification → TASK-CRON-003)*
The admin can see run ledgers, but if the Actions secret is missing every scheduled trigger is red-by-design and **no runs exist to see**. DS-078 remains the umbrella; TASK-CRON-003 adds the concrete verification checklist.

### ADM-F4 — Backlog already owns the rest
Change diffs (DS-050), queue dedupe (DS-051), structured rejection reasons (DS-052), bulk expiry correction (DS-054), product linking at review (DS-055), keyboard ergonomics (DS-056), missing-column banner (DS-057), expiring-offers digest (DS-074), pipeline status card (DS-071), emergency stop (DS-077). Verified still-relevant; not duplicated. Note DS-022 (product CRUD) appears **done** since the backlog snapshot — `app/admin/(protected)/gift-cards/acceptance/`, `giftCardProductActions` tests and `scripts/seed-gift-card-products.ts` now exist; the executor of any DS ticket must re-verify against HEAD first (the backlog itself mandates this).

## Runbook coverage

Operational recovery paths are now written down in `docs/runbooks/` (this audit): cron failure recovery, manual pipeline replay, emergency source pause, migration safety, health-check interpretation, stale/expired-offer incidents, gift-card ingestion failure, offer-accuracy incident.
