# Supabase production migration-ledger reconciliation — 2026-07-16

> Investigation, operator runbook and completed apply record. The 2026-07-17
> ledger repair applied 027–032; the 033–035 (2026-07-21) and 036–037
> (2026-07-22) follow-up applies are recorded in the dated sections below, so
> production is now canonical through **037** (`verify:schema`: 37/37). The
> narrative that follows describes the original 027→032 session; read the
> follow-up sections for the later applies. Project: `numgsivlrglflsnqehac`.

## Recovery point and completed gate

`supabase backups list --project-ref numgsivlrglflsnqehac` reported:

| Region | WALG | PITR | Earliest | Latest |
|---|---:|---:|---:|---:|
| Oceania (Sydney) | true | false | 0 | 0 |

Supabase physical backups remained unavailable, so the explicitly approved
logical-backup path was used before the first write. The checksum-verified,
restore-readable archive is stored at:

`/Users/mayank/Downloads/dealstack-au-production-backups/20260716T141946Z`

A checksum-verified post-032 archive is stored at:

`/Users/mayank/Downloads/dealstack-au-production-backups/20260717T055943Z-post-032`

**Gate result 2026-07-17:** `supabase backups list` still reported WALG true,
PITR false and zero physical backups. A restricted-permission PostgreSQL custom
archive containing `public` plus `supabase_migrations`, schema SQL, archive
manifest, historical SQL files and SHA-256 checksums cleared the approved
logical-backup gate.

## Authoritative remote history mapping

`supabase migration fetch --linked` was run in an isolated `/tmp` project. It
retrieved these statements from `supabase_migrations.schema_migrations`:

| Remote version | Stored name | Corresponding local migration |
|---|---|---|
| 20260627121342 | 006_admin_rate_limits | 006 |
| 20260630104307 | feed_sources_add_source_type | part of 004 |
| 20260630104949 | offer_change_candidates_table | remainder of 004 |
| 20260701043310 | 007_card_offers | 007 |
| 20260709054318 | 005_feed_item_homepage_hidden | 005 |
| 20260710143813 | 008_pin_function_search_path | 008 |
| 20260711015847 | 009_card_offer_lifecycle | 009 |
| 20260711015905 | 010_atomic_admin_rate_limit | 010 |
| 20260711015932 | 011_transactional_admin_audit | 011 |
| 20260711015956 | 012_card_offer_correction_reports | 012 |
| 20260711020044 | 013_revoke_trigger_function_execute | 013 |
| 20260711054808 | 014_signal_product_group | 014 |
| 20260711073444 | 016_pipeline_run_lock | 016 |
| 20260711075007 | 017_card_source_registry | 017 |
| 20260712062224 | 021_gift_card_pipeline | 021 |
| 20260712074506 | gift_card_offer_detail | 022 |
| 20260713233659 | 023_gift_card_accuracy_model | 023, pre-fixed-points form |
| 20260713234540 | 024_gift_card_programmes | 024 |
| 20260714000459 | 025_public_gift_card_offer_history | 025, pre-fixed-points form |
| 20260714000756 | 026_public_correction_reports | 026 |

The remaining local migrations 001–003, 015 and 018–020 have no independent
remote ledger row. Their table/column effects are present according to the
repository's service-role, read-only `verify:schema` probe. This is historical
manual-apply drift, not evidence that those SQL files should now be executed.

## Schema evidence

The 2026-07-16 read-only probe established:

- 023–026 core tables/columns are present.
- Production lacks the later `fixed_points` edits to both 023 and 025.
- 027 is absent from the history and its HTML-source schema effect is absent.
- 028–030 are absent.
- 031–033 are absent.
- 032 would fail against the applied 025 shape unless 031 also adds
  `gift_card_offer_occurrences.fixed_points` and replaces its mechanic check.

Migration 031 now performs that forward convergence without backfilling values.

## History repair — completed 2026-07-17

After the backup verified, the timestamp aliases below were marked reverted and
canonical versions 001–026 marked applied. `migration list` confirmed the exact
expected pairing before any DDL.

```bash
supabase migration repair --status reverted \
  20260627121342 20260630104307 20260630104949 20260701043310 \
  20260709054318 20260710143813 20260711015847 20260711015905 \
  20260711015932 20260711015956 20260711020044 20260711054808 \
  20260711073444 20260711075007 20260712062224 20260712074506 \
  20260713233659 20260713234540 20260714000459 20260714000756

supabase migration repair --status applied \
  001 002 003 004 005 006 007 008 009 010 011 012 013 \
  014 015 016 017 018 019 020 021 022 023 024 025 026
```

Immediately verify:

```bash
supabase migration list
supabase db push --dry-run
```

Expected: 001–026 appear in both columns and only 027–033 are pending. Stop if
the result differs. Do not run a non-dry-run `db push`: it has no target-version
flag and would apply every pending migration.

## One-at-a-time apply sequence — completed

Each reviewed SQL file was applied with `ON_ERROR_STOP` and a single database
transaction, then only that version was repaired to `applied`:

1. 027 — disabled Point Hacks HTML source support.
2. 028 — acceptance extensions.
3. 029 — private predictions with DateStyle-independent ISO identity;
   requires 027.
4. 030 — job-run kinds and lock acquisition.
5. 031 — forward fixed-points convergence, including occurrence history.
6. 032 — Sydney lifecycle and forward correction of the applied programme
   calendar policies; requires 030 and 031. Migration 028's unapplied removal
   RPC is also Sydney-correct before its apply. Its lifecycle-only backfill
   temporarily restores the same public-accuracy constraint as `NOT VALID`, so
   legacy reviewed rows do not block classification and remain subject to the
   existing approval boundary on their next factual update.

After each file:

```bash
supabase migration repair <version> --status applied
supabase migration list
npm run verify:schema
supabase db lint --linked --level error --fail-on error
```

Run the migration-specific tests and app checks before continuing. Stop after
032. Migration 033 remains approval-gated pending review of existing public
offers.

### Apply result

- 027–031 applied once and verified cleanly.
- The first 032 attempt hit a legacy `NOT VALID` public-accuracy constraint;
  the surrounding single transaction rolled back completely and 032 was not
  recorded.
- 032 was corrected to restore the same constraint as `NOT VALID` around only
  the lifecycle classification backfill, retested, and applied successfully.
- Backfill result: 10 published rows classified `active`, 5 already-unpublished
  rows classified `archived`, zero visibility inconsistencies.
- `verify:schema`: 35/35 tables match. Linked database lint: zero errors.
- Final dry run lists only `033_gift_card_offer_approval_hardening.sql`.
- All source and job gates remain disabled.

## 2026-07-21 follow-up apply — 033, 034, 035

Applied to make GCDB offers 12943/12944 real through the canonical pipeline
(the approve RPC and the public "upcoming" tier both require these). Each was
applied as its own transaction and recorded in `schema_migrations` under its
canonical version:

1. 033 — hardened `approve_gift_card_candidate` RPC, the two-arm public RLS
   policy (active-published + approved-future upcoming tier), the
   reviewed-lifecycle/fee-waiver `NOT VALID` checks and the publication-lineage
   trigger. Applied from the 2026-07-21 working-tree revision (the two-arm
   policy), NOT the originally-gated single-arm draft.
2. 034 — additive `gift_card_offers.purchase_limits` and
   `gift_card_products.purchase_fees` jsonb columns with `NOT VALID` object
   checks.
3. 035 — re-issue of the 033 RPC that validates and persists
   `purchase_limits` on both the insert and conflict-update arms.

- `verify:schema`: 35/35 tables match after the apply.
- **Public-visibility side effect (expected):** the new RLS requires
  `confidence = 'confirmed'`, so two legacy `needs-verification` active offers
  (`gc-apple-points`, `gc-coles-group-bonus-points`) are now hidden from public
  reads. They are NOT deleted — a re-review that raises them to `confirmed`
  restores them. This is the intended "hide legacy unconfirmed rows" behaviour
  of 033; the TASK-GC-001 legacy review should reconcile those two offers.

## 2026-07-22 follow-up apply — 036, 037 (offer-expiry RLS)

Applied to complete the database layer of the Sydney-inclusive expiry model
(see [`offer-expiry-semantics.md`](offer-expiry-semantics.md)). Both are
policy-only, forward, visibility-neutral or purely tightening — no columns, no
data, no grants. Each recorded in `schema_migrations` under its canonical
version:

1. 036 — adds the `expiry_date IS NULL OR expiry_date >= sydney_today` bound to
   the public-read policies of `cashback_offers`, `points_offers`,
   `weekly_deals` and `ozbargain_signals` (previously `is_published`/`status`
   only). Tightening-only: can only hide an already-expired row; a NULL expiry
   stays evergreen. Applied from the working-tree file, not a draft.
2. 037 — re-issues the `card_offers` public-read policy and its history mirror
   with `Australia/Sydney` + `statement_timestamp()` in place of migration 009's
   `Australia/Melbourne` + `now()`. Melbourne and Sydney share offset and DST
   rules, so no row's visibility changes on any date; it removes the last
   divergent timezone expression.

- `verify:schema`: 37/37 tables match after the apply.
- Post-apply prod state: **0** `Australia/Melbourne` policies, **10**
  `Australia/Sydney` policies — every public offer table now enforces the Sydney
  expiry date at the DB layer.
- No visibility side effect: service-role callers (the cleanup/lifecycle jobs)
  bypass RLS, and the app read boundary already excluded expired rows.

## Commands that remain prohibited

- `supabase db reset --linked` — destructive remote reset.
- `supabase db push` while more than the one intended migration is pending.
- Reverting timestamp history without also canonicalising the verified local
  001–026 history in the same controlled maintenance window.
- Applying 032 before the corrected 031.
