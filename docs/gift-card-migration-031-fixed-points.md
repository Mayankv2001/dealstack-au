# Migration 031 — fixed_points drift reconciliation

> Authored 2026-07-15 as a drift-reconciliation design and **applied to
> production 2026-07-17** as ledger version 031 after a verified logical backup.
> No point values were backfilled and no source or job gate was enabled.

## 1. What drifted, and the evidence

Migration `023_gift_card_accuracy_model.sql` was applied to production in its
**pre-2026-07-14 form**. The 023 *file* was later edited (commit `84ac591`,
2026-07-14) to add the `fixed_points` points mechanic. That edit never reached
production because 023 was already recorded as applied.

Read-only production probes (2026-07-15) confirmed the exact shape of the drift:

| Object | Repo 023 (current file) | Production | Delta |
|---|---|---|---|
| `gift_card_offers` 023 columns | 13 | 12 present | **`fixed_points` missing** |
| `gift_card_offer_candidates` 023 columns | 13 | 12 present | **`fixed_points` missing** |
| `gift_card_offer_occurrences` 025 columns | includes `fixed_points` | column absent | **032 history sealing would fail without reconciliation** |
| `approve_gift_card_candidate` | maps `fixed_points` | no `fixed_points` | RPC behind |
| `gift_card_candidates_accuracy_values_check` | has `fixed_points > 0` | absent | check behind |
| `gift_card_offers_accuracy_values_check` | has `fixed_points > 0` | absent | check behind |
| `gift_card_offers_public_accuracy_check` (NOT VALID) | points branch accepts multiplier **or** fixed_points | requires `points_multiplier > 0` | **fixed-points-only offers cannot publish** |

All other 023 objects (`reward_destination`, `is_ongoing`, `source_present`,
`fixed_discount_dollars`, the compound-split triggers, `source_fingerprint`,
etc.) are present in production. So this is a single, well-scoped column drift —
not an unapplied 023. Production also has 024/025/026 applied
(`gift_card_programmes`, `gift_card_offer_occurrences`, `public_correction_reports`
and their functions all existed); 027–030 were **not** applied at that probe.

## 2. Decision gate — is `fixed_points` intentional? → **Option A (yes)**

`fixed_points` is a load-bearing, current product requirement, not stray SQL:

- Canonical type `GiftCardOffer.fixedPoints` (`lib/offers/types.ts:87`).
- Public read path selects and maps it (`lib/repos/offers.ts:61,127`).
- A **direct production SELECT names the column**
  (`lib/admin/repos/giftCardPipeline.ts:753`) — the drift is a latent break in
  the gift-card admin/ingest path.
- The Point Hacks weekly parser emits `fixedPoints` ("2,000 bonus points")
  (`lib/giftcards/pointHacksWeekly.ts`) — the exact mechanic the weekly
  ingestion programme is being built around.
- Consumed by valuation, stackability, duplicate detection, change
  classification, compatibility, view-models, planner, and stack engine; 20+
  tests assert `fixedPoints: 2000` behaviour; the RPC's points validation
  requires exactly one of multiplier or fixed_points.

Removing it (Option B) would mean deleting the mechanic from the entire
gift-card domain and the weekly ingestion — not viable. **Option A selected.**

## 3. Reconciliation approach — forward migration, 023 left frozen

- **023 is not modified.** It is applied; the repository keeps it as the
  documentary record of the intended accuracy model. The repo's own contract
  test (`migrationContracts.test.ts`) already asserts 023 contains
  `fixed_points`; reverting 023 would break that and would itself be a rewrite
  of an applied migration.
- **`fixed_points` is added by a new forward migration, `031`.** Numbering
  follows repository convention (next free number after the existing 021–030
  set; existing migrations are **not** renumbered).
- **Why re-running 023 is unsafe / not the mechanism:** Supabase records 023 as
  applied and will not re-run it; 023 also contains a `update … where true`
  data-touch and trigger re-creations. "Re-run 023" is both impossible via the
  ledger and undesirable. A targeted forward migration is the correct repair.
- **Convergence:** 031's constraint / trigger / RPC bodies are byte-identical to
  the current 023 file. On a fresh replay, 023 creates `fixed_points` and 031 is
  an idempotent no-op (`add column if not exists`, `drop constraint if exists` +
  re-add, `create or replace`). In production, 023 did not create it and 031
  adds it. Both lineages end in the same schema.

## 4. What 031 does (all additive / idempotent)

1. `add column if not exists fixed_points numeric` on offers, candidates and
   occurrence history (no backfill;
   existing rows stay `NULL` — no invented point values).
2. Replaces production 025's generated-name occurrence mechanic check with a
   stable fixed-points-aware check. Existing occurrence rows remain valid.
3. Re-adds the two accuracy value checks with `(fixed_points is null or
   fixed_points > 0)`. Re-validation passes because the column is newly all-NULL.
4. Re-adds `gift_card_offers_public_accuracy_check` **NOT VALID** so legacy
   published rows are not retro-validated, with a points branch that accepts a
   fixed-points-only offer under the one-of-multiplier-or-fixed-points rule.
5. `create or replace` the `sync_gift_card_candidate_accuracy` trigger function
   (adds the `fixed_points` sync + fingerprint key).
6. `create or replace` `approve_gift_card_candidate` with `fixed_points` in the
   points validation, INSERT column/VALUES lists, and ON CONFLICT update — every
   existing guard, field mapping, `SECURITY DEFINER`, `set search_path = ''`,
   full object qualification, and `service_role`-only grant preserved.

Retry-idempotent: every `add constraint` is preceded by `drop constraint if
exists`; functions use `create or replace`; the column uses `if not exists`.

## 5. Schema-manifest representation of the corrected end state

- `031_gift_card_fixed_points_reconciliation.sql` added to `COVERED_MIGRATIONS`.
- `fixed_points` ownership re-attributed **023/025 → 031** on all three tables, because
  031 is the migration whose application creates the column in the authoritative
  (production) lineage. This keeps `npm run verify:schema` honest: until 031 is
  applied it reports the drift; after 031 it passes.
- A new drift-regression contract test fails if either the manifest attribution
  or 031's coverage is reverted — the drift can no longer recur silently.
- No migration checksum convention is affected: this repo establishes schema
  truth by `information_schema` probing (`verify:schema`, `schema-drift.yml`),
  not by the Supabase ledger, precisely because of hand-applied history like
  this. The 023 ledger row is left as-is.

## 6. Migration 027 readiness (verified read-only)

`027_point_hacks_weekly_gift_cards.sql` was applied immediately before 028–031:

- Production `gift_card_sources_source_type_check` is currently
  `CHECK (source_type = ANY (ARRAY['rss','atom','api']))` — `html` absent, so
  027 was genuinely unapplied before the 2026-07-17 apply.
- Every existing source row uses `source_type = 'rss'`; expanding the constraint
  to include `html` invalidates **no** existing row (verified).
- The old constraint is correctly identified and replaced (`drop constraint if
  exists` → `add constraint … in ('rss','atom','api','html')`) — re-run safe.
- The Point Hacks seed inserts with `enabled=false`,
  `automated_fetch_allowed=false`, null permission stamps, `on conflict do
  nothing` — disabled, no ingestion, no permission implied.
- FKs/defaults are compatible; it can be applied before 028–030 without runtime
  breakage. **029 requires 027** (it inserts an `html` `gcdb_predictions`
  source), so 027 must precede 029.

## 7. Recommended production apply order

`031` is independent of 027–030 (it touches only the offer/candidate accuracy
schema). The **fixed_points drift is the only ACTIVE app⇄prod mismatch**
(deployed code already expects the column); 027–030 are additive and dormant
(their consumers are un-started Wave 1 work). Applying 031 first closes the
active mismatch soonest with no added risk:

```
031 (fixed_points reconciliation)   ← first: closes the active drift
 → 027 (html source type)           ← required before 029
 → 028 (acceptance extensions)
 → 029 (predictions; needs 027)
 → 030 (run_kind)
 → 032 (Sydney lifecycle; needs 025/030/031)
 → 033 (approval identity/publication hardening; needs 031/032)
```

Each apply is user-approved; after each, run `npm run types:gen` +
`npm run verify:schema` (Node 20). The operator order above deliberately closes
the recorded 031 drift before any later source/job enablement;
032 and 033 then install lifecycle and approval boundaries against that
converged schema. Confirm the remote migration ledger before every apply.

## 8. Rollback

031 is additive; the column is newly all-NULL. Before any fixed-points offer is
published, rollback = re-declare the pre-031 production bodies of the three
constraints + the trigger + the RPC (captured in §1 evidence / production dumps),
then `drop column if exists fixed_points` on both tables. Occurrence/audit
history is never touched.

## 9. Static vs apply-time validation

Everything below is **static** (SQL text review, TypeScript/lint/manifest/contract
tests) plus **read-only** production probing. No DDL was executed. Real
apply-time validation (constraint re-validation cost, RPC recompile, trigger
swap) must still be performed in a Supabase branch or a reviewed apply window
before production sign-off.
