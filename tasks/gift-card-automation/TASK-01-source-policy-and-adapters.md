# TASK-01 — Source policy audit and adapter permission states

## Goal
Produce the authoritative source-permission record for every source the
programme touches, and encode adapter enable/disable expectations, without
enabling anything.

## Scope
- Document, for each source below: robots directives, visible terms/policy
  statements, whether an API / RSS / JSON-LD / structured feed exists, the
  chosen retrieval mode per the preference order (API → feed → JSON-LD →
  permitted HTML → admin-assisted capture), and the resulting adapter state.
  - `https://gcdb.com.au/offers/` (existing `gcdb` RSS source)
  - `https://gcdb.com.au/predictions/`
  - GCDB merchant database pages (acceptance lists)
  - `https://www.pointhacks.com.au/weekly-gift-card-offers/` (027 row)
  - Coles / Woolworths / Big W catalogue promotion pages (linked retailer evidence)
- Record findings in `docs/gift-card-source-policy.md` (new) with checked-on
  dates and exact quoted robots lines. Where automated fetch is not clearly
  permitted, the documented mode is **admin-assisted capture** and the adapter
  stays disabled.
- Specify (document only) the SQL that a future operator would run to stamp
  `terms_checked_at` / `robots_checked_at` — do not run it.

## Files likely involved
- `docs/gift-card-source-policy.md` (new)
- Read-only: `supabase/migrations/017_card_source_registry.sql`, `021`, `027`,
  `lib/security/urlPolicy.ts`, `lib/giftcards/fetchEditorialPage.ts`,
  `docs/gift-card-pipeline.md`

## Dependencies
None. Wave 0.

## Inputs
Live robots.txt fetches (plain GET of `/robots.txt` is permitted), page-visible
terms text. No crawling beyond the named pages and robots files.

## Exact deliverables
1. `docs/gift-card-source-policy.md` — one section per source with the fields
   above plus the evidence-hierarchy tier each source occupies.
2. A short "adapter state table" (source → gates → operating mode).
3. A list of any source that must remain admin-assisted-only, with reasons.

## Constraints
- Do not fetch beyond robots.txt + the named public pages; no anti-bot bypass;
  identify honestly if a fetch is made manually via the browser.
- Do not modify any DB row, env var, or workflow.
- Standing constraints in `TASK-00-INDEX.md` apply (no commit/push/etc.).

## Required tests
None (documentation task). `npm run lint` must still pass (no code changes).

## Acceptance criteria
- Every source has a recorded robots/terms finding with a checked-on date.
- No recommendation enables automated fetch without explicit permission
  evidence quoted in the doc.
- Admin-assisted fallback described for each non-permitted source.

## Commands to validate
`nvm use 20 && npm run lint`

## Non-goals
Writing adapters, migrations, or registry rows; changing `urlPolicy.ts`.
