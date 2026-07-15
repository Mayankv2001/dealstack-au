# TASK-09 — Acceptance ingestion and merchant-alias resolution

## Goal
Turn captured merchant-list snapshots (GCDB merchant DB, issuer lists) into
staged acceptance candidates with safe alias resolution — admin-assisted by
default, nothing auto-merged, nothing auto-published.

## Scope
- New `lib/giftcards/parseMerchantList.ts`: pure parser from a captured
  snapshot (HTML fixture or admin-pasted text) to raw merchant-name entries
  with any per-merchant channel/limitation hints the source explicitly states.
- New `lib/giftcards/resolveMerchantAlias.ts`: resolve raw names to canonical
  `stores` rows using `stores.aliases` + the normalisation rules in
  `lib/sources/normalise.ts` (reuse its exported helpers; extend that module
  rather than duplicating matching logic). Results:
  `resolved | unresolved | ambiguous` (≥2 plausible stores → ambiguous, always
  admin-reviewed). Nike/Nike Australia/Nike.com-style variants covered by
  data, not hard-coded conditionals; JB Hi-Fi/JB HiFi normalisation via the
  existing text-normalisation path.
- Candidate creation: parsed entries + resolution results →
  `gift_card_acceptance_candidates` rows (change kind `new`/`changed`/
  `removed` by comparison with current approved acceptance), evidence URL +
  captured-at from the snapshot metadata, `evidence_source_type` from the
  source registry row (a GCDB list is `gcdb`, never issuer-official).
- Admin-assisted capture endpoint/action: admin pastes or uploads the
  snapshot in the admin UI (server action, service-role, audited, rate-limited
  via the existing `lib/admin/rate-limit.ts` pattern). Automated fetch path
  exists as a disabled adapter only if TASK-01 recorded permission.

## Files likely involved
`lib/giftcards/parseMerchantList.ts` (new),
`lib/giftcards/resolveMerchantAlias.ts` (new), `lib/sources/normalise.ts`
(extend exports only), `lib/admin/repos/giftCardAcceptance.ts`,
`app/admin/(protected)/gift-cards/` (capture action),
`tests/giftcards/parseMerchantList.test.ts`,
`tests/giftcards/resolveMerchantAlias.test.ts` (new),
`tests/fixtures/` merchant-list fixture (genuinely captured, trimmed).

## Dependencies
TASK-08 (staging shape). TASK-01 (permission verdicts). Wave 2.

## Inputs
Plan §6; `normalise.ts` (read fully first — longest-alias-wins, short-alias
whole-word rules); stores seed data for alias coverage.

## Exact deliverables
Parsers + resolver + candidate staging + capture action + tests + fixture.

## Constraints
- Never auto-approve a resolution; `resolved` still requires admin review of
  the candidate. Ambiguity always blocks.
- Alias resolution must not merge unrelated merchants — resolver returns
  ambiguous when scores tie; no fuzzy auto-accept below exact/known-alias.
- No large merchant list hard-coded anywhere; fixtures are test inputs only.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
Alias variants resolve to one store; unrelated near-names stay separate;
ambiguous flagged; unresolved preserved with raw name; additions/removals
detected vs existing acceptance; evidence tier stamped from source registry;
rate-limit + audit on the capture action.

## Acceptance criteria
Zero auto-merges in the diff; every candidate row carries evidence URL +
captured-at; capture path works with no automated fetching enabled.

## Commands to validate
`nvm use 20 && npm run lint && npm run test:giftcards && npm run test:admin && npx tsc --noEmit`

## Non-goals
Acceptance reconciliation scheduling (TASK-10); review UI polish (TASK-14);
enabling any adapter.
