# Gift-card automation — migrations 028–030 design and apply record

> Authored in TASK-02 (Wave 0) and **applied to production 2026-07-17** as
> ledger versions 028, 029 and 030 after a verified logical backup and
> one-at-a-time transactional review. Every change
> is additive at the data-model level. Migration 028 deliberately tightens the
> existing acceptance read policy so post-028 public rows must also be marked
> `review_state='approved'`; legacy rows remain stored but fail closed until
> reviewed.
> `scripts/schema-manifest.ts` describes the applied schema; generated database
> types were refreshed after migration 032.

## Apply order and prerequisites

`023 → 024 → 025 → 026 → 027 → 028 → 029 → 030` (numeric order).

- **028** requires 021 (`gift_card_products`, `gift_card_merchant_acceptance`, `stores`, `gift_card_raw_items`, `gift_card_sources`, `audit_log`).
- **029** requires 021 (`gift_card_offers`, `gift_card_sources`) and the `html` `source_type` value added by **027**.
- **030** requires 021 (`gift_card_ingest_runs`).

## RLS statement per table

| Table | Migration | RLS | Public policy? |
|---|---|---|---|
| `gift_card_products` (extended) | 028 | unchanged (021) | unchanged |
| `gift_card_merchant_acceptance` (extended) | 028 | enabled | tightened to `is_public=true AND review_state='approved'` |
| `gift_card_acceptance_evidence` (new) | 028 | **enabled, no policies → default-deny (service-role only)** | none; append-only review history |
| `gift_card_acceptance_candidates` (new) | 028 | **enabled, no policies → default-deny (service-role only)** | none |
| `gift_card_offer_predictions` (new) | 029 | **enabled, no policies → default-deny (service-role only)** | **none — predictions are never public** |
| `gift_card_ingest_runs` (+`run_kind`) | 030 | unchanged (021) | unchanged |

The only paths from a candidate to the public `gift_card_merchant_acceptance`
table are the audited security-definer RPCs `approve_gift_card_acceptance_candidate`
and `approve_gift_card_acceptance_removal`
(`set search_path = ''`, granted to `service_role` only) — mirroring
`approve_gift_card_candidate`. Predictions have no publication RPC and never
enter `gift_card_offers`.

## Requirement → column mapping

### 028 — acceptance model (plan §6)
- Source provenance: `gift_card_sources.acceptance_evidence_source_type` stores
  the reviewed acceptance evidence tier. Capture actions read this registry
  field; browser input cannot self-assert an official tier.
- Product logistics: `gift_card_products.aliases`, `official_product_page`,
  `activation_method`, `online_available`, `in_store_available`, `denominations`,
  `activation_delay_note`, `split_payment` (`supported|unsupported|partial|unknown`),
  `expiry_or_fees_note`. All nullable/defaulted; `denominations` is nullable so
  `null` = unknown (distinct from `{}` = known-none).
- Channel (tri-state boolean, `null` = unknown): `accepts_online`,
  `accepts_in_store`, `accepts_app`, `accepts_phone`.
- Evidence + freshness: `acceptance_status`
  (`confirmed-accepted|confirmed-not-accepted|likely-accepted|unofficially-reported|requires-verification|stale|unknown`),
  `evidence_source_type` (`issuer-official|merchant-official|terms|card-network-mcc|gcdb|specialist|community`),
  `evidence_publisher`, `evidence_url`, `evidence_captured_at`, `last_checked_at`, `valid_from`,
  `valid_until`, `limitations`, `region` (default `AU`),
  `participating_location_required`, `review_state`.
- Legacy `status` (`verified|claimed|community`) is **untouched** for
  backwards compatibility. Documented mapping to `acceptance_status` lives in
  the migration header.
- Reconciliation/dedupe: two partial unique indexes, both applying only to
  *published* rows. Store-resolved facts are unique by
  `product_id, store_id, coalesce(mcc,-1), region`; unresolved facts additionally
  include normalised `merchant_name` and `merchant_category`, preventing distinct
  named merchants from collapsing into one generic MCC record. The migration
  preflights existing public duplicates and aborts before creating either index;
  staged rows may repeat. Plus `store_id`, `mcc`, `lower(merchant_name)` indexes
  support alias/merchant resolution.
- Staging: `gift_card_acceptance_candidates` (raw name, source/raw-item FKs,
  proposed product/store, `proposed_values jsonb`, `resolution_state`
  `resolved|unresolved|ambiguous`, `change_kind` `new|changed|removed`,
  `review_status`, reviewer, `linked_acceptance_id`). Unresolved/ambiguous names
  are for admin review — **never auto-merged**. Candidate JSON must be an object;
  an `updated_at` trigger records non-RPC changes as well as approvals.
- Approval safety: the RPC locks the candidate, requires `resolved` plus a
  non-removed change, is idempotent after approval, and can update only an
  acceptance row prelinked to that candidate. It requires an acceptance
  identity, HTTPS evidence URL, capture time and reviewer. It rejects a weaker
  or older evidence/status revision when the linked row is already public,
  then writes the candidate link and audit row in the same transaction.
- Evidence retention: `gift_card_acceptance_evidence` is an append-only,
  service-role-only ledger. Each approval records the reviewed evidence and an
  upgrade first backfills any legacy canonical evidence, so official evidence
  can supersede unofficial evidence without destroying the earlier record.
- Removal safety: the separate removal RPC accepts only a prelinked `removed`
  candidate, retains the historical evidence row, closes `valid_until`, changes
  the canonical state to `confirmed-not-accepted` or `requires-verification`,
  and audits the candidate transition in the same transaction. It never deletes
  an acceptance fact.

### 029 — predictions (plan §7)
- `gift_card_offer_predictions`: immutable original predicted identity (seller,
  families, verbatim promotion text, structured type/value and dates),
  `source_url`/`source_last_updated`, per-row `source_reference_url`, raw
  uninterpreted `source_marker`, `status`
  (`predicted|confirmed|historical|prediction_matched|prediction_missed|prediction_partially_matched`),
  `linked_offer_id text references gift_card_offers on delete set null` (set on
  match, prediction row never overwritten), `comparison_notes`, `reviewed_at`.
- `fingerprint` is a stored generated value over normalised seller,
  sorted/deduplicated normalised families and the predicted start/end window.
  `unique (source_id, fingerprint)` makes exact and concurrent re-capture
  idempotent while keeping family-distinct predictions separate. The parser and
  SQL use the same control-delimited UTF-8 ordering algorithm.
- `reject_gift_card_prediction_fact_mutation` blocks changes to every original
  captured fact (including source metadata, marker and reference URL); only
  outcome fields, comparison notes, review linkage/timestamps and `updated_at`
  remain mutable.
- No confidence column (plan §7: only if GCDB states one).
- Registers `gcdb_predictions` in `gift_card_sources` (`source_type='html'`,
  canonical URL `https://gcdb.com.au/predictions/`, both gates `false`, null
  stamps) — **disabled**. Re-applying the seed closes both gates while
  preserving any later human permission-review timestamps.
- A private `updated_at` trigger preserves modification time for prediction
  review/reconciliation updates.

### 030 — job-run registry (plan §5)
- `gift_card_ingest_runs.run_kind` (`ingest|reconcile|activate-archive`,
  default `ingest`).
- `lease_expires_at` records each row's maximum run age. Existing history is
  deterministically backfilled from `started_at` and the kind-specific window;
  no row is deleted or invalidated.
- `idx_gc_job_runs_one_running_per_kind` enforces one running row per
  `(source_id, run_kind)`, matching the TASK-02 contract. The legacy all-job
  global lock is dropped only after its replacements exist.
- `idx_gc_job_runs_mutation_fence` is a narrower constant-key partial unique
  index over running `reconcile` and `activate-archive` rows. These jobs both
  mutate reviewed offer truth and therefore remain mutually exclusive.
- `idx_gc_ingest_runs_kind (source_id, run_kind, started_at desc)` supports the
  now-explicitly scoped stale takeover and interval lookups.
- `acquire_gift_card_job_run` is a service-role-only, `SECURITY DEFINER`, empty
  `search_path` RPC. Under one transaction advisory lock it expires an elapsed
  lease and inserts the replacement row; a live unique-index conflict returns
  `null` (`already-running`) without changing the conflicting row.

## Locking / idempotency safety (030)

All three runner repositories use the transactional acquisition RPC and filter
interval queries by both ledger source and exact run kind. Normal stale takeover
is exact source + kind. The deliberate exception is an *expired* lease inside
the reconcile/lifecycle mutation fence: either mutator may finalise that dead
lease before acquiring, so a crashed owner cannot block the other forever. It
cannot touch a live fenced lease, an ingest lease, or an unrelated kind. Existing
rows default to `run_kind='ingest'`; the legacy global lock guarantees they
cannot violate either replacement unique index while migration 030 is executing.

Safe simultaneous combinations after 030 and the matching runner code deploy:

- different-source ingest + ingest: allowed; each writes source-scoped raw and
  private candidate state;
- ingest + reconcile: allowed; candidate conflicts remain private and are
  idempotently rejected/staged for review, never auto-published;
- ingest + activate/archive: allowed; ingest cannot publish or mutate approved
  offer lifecycle/history state;
- reconcile + activate/archive: **blocked** by the mutation fence because both
  may change the same reviewed offer truth.

The code and schema must roll out as a closed-gate unit: confirm every gift-card
job gate is off, apply 030, deploy the source/kind-scoped runners, then verify
the ledger before any separate enablement approval. Deploying the new code
before 030 fails closed at the missing `run_kind` query (controlled route error,
no run acquired). Applying 030 while old runners are allowed to execute is not
safe because those runners did not scope stale takeover; the gates must remain
closed throughout.

## Rollback DDL

Each migration file carries its exact rollback block in the header comment.
Summary:
- **030**: rollback requires quiescing callers and finalising all but one
  currently running row, because concurrency valid after 030 violates the old
  global index. Restore `idx_gc_ingest_runs_one_running` first, then drop the
  mutation fence, per-kind lock and lookup/lease indexes, drop the acquire RPC,
  lease constraint and `lease_expires_at`, and finally drop `run_kind`.
  Export non-`ingest` classifications first if job-run history matters.
- **029**: drop the predictions table and its private identity/immutability
  functions, then delete the `gcdb_predictions` source row. The table must be
  dropped first because prediction provenance uses `ON DELETE RESTRICT`.
- **028**: drop the RPCs, candidates/evidence tables, new indexes, tightened
  policy, and added columns. Restoring the old `is_public`-only policy is a
  separate explicit recovery decision because it weakens the review boundary.
Rollback of 028 or 029 is **destructive** for facts/candidates/predictions
written after apply. Export those records first; it is not lossless data repair.

## No overlap with 023–027 (checked against plan §2)

- 023 added candidate/offer accuracy columns + the offer approve RPC — **not**
  acceptance/product logistics. 028 touches disjoint columns/tables.
- 024/025/026 added programmes/occurrences/correction-reports — unrelated.
- 027 added the `html` source_type + Point Hacks row — 029 reuses that
  `source_type` value and adds a *different* source row + a new table.
- No table or column defined here is already defined by 021–027.
