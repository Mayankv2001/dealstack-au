# TASK-02 — Migration design and authoring: 028 acceptance, 029 predictions, 030 run registry

## Goal
Author (never apply) the additive migrations completing the schema for
acceptance, predictions, and generalised job runs, reusing 021–027 shapes.

## Scope
- **028_gift_card_acceptance_extensions.sql**
  - `gift_card_products`: add `aliases text[] default '{}'`,
    `official_product_page text`, `activation_method text`,
    `online_available boolean`, `in_store_available boolean`,
    `denominations numeric[]`, `activation_delay_note text`,
    `split_payment text check (... in ('supported','unsupported','partial','unknown'))`,
    `expiry_or_fees_note text` (all nullable/defaulted; unknown stays unknown).
  - `gift_card_merchant_acceptance`: add nullable tri-state channel columns
    `accepts_online` / `accepts_in_store` / `accepts_app` / `accepts_phone`
    (boolean), `acceptance_status text` with check in
    (`confirmed-accepted`,`confirmed-not-accepted`,`likely-accepted`,
    `unofficially-reported`,`requires-verification`,`stale`,`unknown`),
    `evidence_source_type text` check in (`issuer-official`,
    `merchant-official`,`terms`,`card-network-mcc`,`gcdb`,`specialist`,
    `community`), `evidence_url text`, `evidence_captured_at timestamptz`,
    `last_checked_at timestamptz`, `valid_from date`, `valid_until date`,
    `limitations text`, `region text default 'AU'`,
    `participating_location_required boolean`, `review_state text`.
    Keep the existing `status` column untouched for backwards compatibility;
    document the mapping in comments.
  - New table `gift_card_acceptance_candidates` (service-role only, RLS
    default-deny): raw merchant name, source_id FK, raw_item_id FK nullable,
    proposed product_id, resolved store_id nullable, proposed field values
    (jsonb), resolution state (`resolved`/`unresolved`/`ambiguous`),
    change kind (`new`/`changed`/`removed`), review_status, reviewer,
    reviewed_at, linked acceptance_id nullable, created/updated timestamps.
  - Partial unique index for dedupe on acceptance:
    `(product_id, coalesce(store_id,''), coalesce(mcc,-1), region)` where
    review-approved; index on `store_id`, `mcc`, `lower(merchant_name)`.
  - An audited security-definer approve RPC
    `approve_gift_card_acceptance_candidate(...)` mirroring
    `approve_gift_card_candidate` (guard state → upsert acceptance → link →
    audit row; `set search_path = ''`; grant to `service_role` only).
- **029_gift_card_predictions.sql**
  - Table `gift_card_offer_predictions` per plan §7 (status check constraint,
    `linked_offer_id text references gift_card_offers on delete set null`,
    source URL/last-updated, predicted fields all nullable, comparison_notes,
    reviewed_at). RLS default-deny, service-role only. Insert a
    `gcdb_predictions` row into `gift_card_sources` (`source_type='html'`,
    both gates false, null checked stamps).
- **030_gift_card_job_runs.sql**
  - Add `run_kind text not null default 'ingest'` to
    `gift_card_ingest_runs` with check in
    (`ingest`,`reconcile`,`activate-archive`); adjust the one-running partial
    unique index to be per `(source_id, run_kind)`; keep old behaviour for
    existing rows.
- Update `scripts/schema-manifest.ts` with every new column/table (the
  manifest self-audit test requires it).
- Write `docs/gift-card-migration-028-030.md`: purpose, RLS statement per
  table, rollback DDL per migration, apply-order (after 023–027), and the
  columns each requirement maps to.

## Files likely involved
`supabase/migrations/028_*.sql`, `029_*.sql`, `030_*.sql` (new),
`scripts/schema-manifest.ts`, `docs/gift-card-migration-028-030.md` (new).
Read first: migrations 021–027, `scripts/schema-manifest.ts`,
`tests/admin/schemaManifest.test.ts`.

## Dependencies
Plan approval. Wave 0. Blocks all Wave-1 tasks (design review gate).

## Inputs
Plan §6, §7, §13; existing migration style (lowercase SQL, `if not exists`,
header comments including "NOT APPLIED TO PRODUCTION").

## Exact deliverables
Three migration files + manifest update + design doc. **No `types:gen` run**
(types regenerate only after a real apply).

## Constraints
- Additive only; never modify or drop existing columns/policies.
- Every table: explicit RLS enable + default-deny; public read policies only
  where the plan marks a projection public (none in this task).
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
`npm run test:admin` (schema-manifest self-audit must pass with the new files).

## Acceptance criteria
- SQL parses (visual + manifest test); headers mark unapplied status.
- Rollback DDL documented per migration.
- No overlap with what 023–027 already provide (checked against plan §2).

## Commands to validate
`nvm use 20 && npm run lint && npm run test:admin`

## Non-goals
Applying migrations; regenerating types; writing repos/UI; seeding data.
