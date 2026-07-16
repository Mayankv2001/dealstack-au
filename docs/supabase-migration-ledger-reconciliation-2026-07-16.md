# Supabase production migration-ledger reconciliation — 2026-07-16

> Read-only investigation and operator runbook. No migration or history repair
> was executed while preparing this document. Project:
> `numgsivlrglflsnqehac`.

## Stop condition: backup protection is not currently proven

`supabase backups list --project-ref numgsivlrglflsnqehac` reported:

| Region | WALG | PITR | Earliest | Latest |
|---|---:|---:|---:|---:|
| Oceania (Sydney) | true | false | 0 | 0 |

Do not repair history or apply DDL until the Dashboard or CLI shows a usable
backup timestamp or PITR is enabled. Record the verified recovery point and
time before the first write.

**Gate re-check 2026-07-17:** `supabase backups list` still reports WALG true,
PITR false, zero backups (`"backups":[]`). The stop condition remains in force —
no history repair or DDL was run. Options to clear it: enable PITR / plan-level
backups in the Supabase Dashboard, or take and verify a full logical dump
(`supabase db dump --linked` schema + `--data-only`) and record it here as the
recovery point before the first write.

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

## History repair — approval-gated, do not run yet

Only after backup protection is verified, review the fetched remote SQL and the
schema probe, then replace the timestamp aliases with the repository's canonical
versions. `migration repair` changes only history; it does not execute or undo
DDL.

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

## One-at-a-time apply sequence

After the history and backup gates pass, apply exactly one reviewed SQL file in
the production SQL Editor, then repair only that version to `applied`:

1. 027 — disabled Point Hacks HTML source support.
2. 028 — acceptance extensions.
3. 029 — private predictions with DateStyle-independent ISO identity;
   requires 027.
4. 030 — job-run kinds and lock acquisition.
5. 031 — forward fixed-points convergence, including occurrence history.
6. 032 — Sydney lifecycle and forward correction of the applied programme
   calendar policies; requires 030 and 031. Migration 028's unapplied removal
   RPC is also Sydney-correct before its apply.

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

## Commands that remain prohibited

- `supabase db reset --linked` — destructive remote reset.
- `supabase db push` while more than the one intended migration is pending.
- Reverting timestamp history without also canonicalising the verified local
  001–026 history in the same controlled maintenance window.
- Applying 032 before the corrected 031.
