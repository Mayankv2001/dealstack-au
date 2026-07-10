# PLAN-card-offer-public-readiness-gate — Stop unverified card offers reaching public pages

> **STATUS (2026-07-10): SHIPPED** in `ea7d3fe` (merged to `main` via PR #2,
> squash commit `2f2db1d`). Kept as historical reference — do not re-execute.

> **Rank: 1 of 5 (fresh 2026-07-10 backlog). Do this first.** The highest live trust risk is already documented in `PROJECT_STATE.md`: all 5 published `card_offers` rows still carry "Illustrative" copy, `confidence='needs-verification'`, and `expiry_date = null`. `/cards` protects against static demo fallback, but it still renders any published DB row. The fix is a code gate: public card offers must be "public-ready", and admin publish actions must refuse rows that are not.

## Goal

Create a single pure readiness rule for card offers and enforce it in both places:

1. Public `/cards` reads only return card offers that are published, live, confirmed, sourced, dated, and free of demo/placeholder wording.
2. Admin create/update/publish actions return a clear form/action error when an admin tries to publish a row that is not public-ready.

This immediately hides the existing illustrative published card rows without deleting them, and prevents the same state from recurring.

## Exact Files To Touch

| File | Change |
|---|---|
| `lib/offers/cardReadiness.ts` | New pure helper: `cardOfferReadiness`, `isPublicReadyCardOffer`, placeholder marker list scoped to card copy |
| `lib/repos/offers.ts` | Filter `getCardOffers()` with `isPublicReadyCardOffer` after `filterLive(rows)` |
| `app/admin/(protected)/card-offers/actions.ts` | Reject `isPublished=true` unless the parsed input passes readiness; validate `setPublished()` by reading the row first |
| `lib/admin/repos/cardOffers.ts` | Add `assertCardOfferCanPublish` or `getCardOfferForPublishCheck`; optionally make `setCardOfferPublished` refuse publish when row is not ready |
| `components/admin/CardOfferForm.tsx` | Add concise helper text near Publish/Confidence/Expiry so admins know the rule before submit |
| `tests/admin/cardOfferReadiness.test.ts` | New tests for the pure readiness helper and publish-blocking edge cases |
| `tests/admin/dbFallback.test.ts` | Add one assertion that demo cards still appear only in static/no-Supabase mode, not configured DB mode |

Do **not** edit `app/layout.tsx` or `app/globals.css`.

## Implementation Order

1. Read `AGENTS.md`, then read the Next docs relevant to Server Actions before editing:
   - `node_modules/next/dist/docs/app/getting-started/updating-data.md`
   - `node_modules/next/dist/docs/app/api-reference/functions/revalidatePath.md`
2. Add `lib/offers/cardReadiness.ts`.
   - Export a shape that accepts both public `CardOffer` and admin `CardOfferInput`-like objects.
   - Required for public-ready:
     - `confidence === "confirmed"`
     - `expiryDate` is non-null and not past via `isPastExpiry(expiryDate, todayAU())`
     - `sourceUrl` is non-empty, parseable, and `https:`
     - at least one headline value fits the `offerType` (`bonusPoints` for sign-up/points bonus, `cashbackAmount` for cashback, `statementCreditAmount` for statement credit; annual-fee discount may use `annualFee`)
     - `offerSummary`, `eligibilityNotes`, and `cardName` contain no markers matching the existing high-precision placeholder concepts: `illustrative`, `placeholder`, `lorem`, `sample only`, `demo row`, `example only`
   - Return `{ ready: true }` or `{ ready: false, reasons: string[] }`; do not throw.
3. In `lib/repos/offers.ts`, change `getCardOffers()`:
   - Keep `fromDbOrDemo` exactly as-is.
   - Keep `filterLive(rows)` first.
   - Then return only `isPublicReadyCardOffer`.
   - Do not filter static/demo rows when `DATA_SOURCE=static` or Supabase env is absent; local demo mode is allowed to show illustrative examples.
4. In `app/admin/(protected)/card-offers/actions.ts`, after `parseCardOfferForm`:
   - If `parsed.input.isPublished` is true and readiness fails, return `{ error: "Cannot publish: ..." }`.
   - Include all reasons in one short sentence so the admin can fix the row without guessing.
   - Revalidate `/cards`, `/search`, and affected admin pages after any card write, because cards also appear in cross-entity search.
5. In `setPublished(id, true)`, read the existing card row via the admin repo, run the same readiness helper, and return a typed error instead of flipping the flag when it fails.
6. Add helper copy to `CardOfferForm`:
   - Near `Confidence`: "Published card offers must be Confirmed."
   - Near `Expiry date`: "Required before publishing; cards without an expiry stay draft-only."
   - Near `Source URL`: "Use the issuer's HTTPS offer or card page."
7. Add tests.
   - Pure tests should not require Supabase.
   - Do not mock `Date` globally; pass a fixed `today`/`now` into the helper or expose an optional clock parameter.

## Edge Cases A Weaker Model Would Miss

1. **Do not import `lib/admin/placeholderCopy.ts` into public repo code.** It is pure today, but it lives under `lib/admin`; importing it into `lib/repos/offers.ts` blurs the server/public boundary. Keep the card-readiness helper in `lib/offers`.
2. **Do not make `needs-verification` impossible to save.** Draft card offers should remain useful work-in-progress rows. Only publishing is blocked; saving a draft with incomplete data must still work.
3. **Do not rely only on the form checkbox path.** Existing published rows and list-page publish toggles bypass the form's submit path. `setPublished()` must enforce the same rule.
4. **Do not delete or auto-unpublish current rows.** The public getter hiding them is enough. Admins still need to see and fix the rows in `/admin/card-offers`.
5. **Static/demo mode is intentionally different.** When `DATA_SOURCE=static` or Supabase is missing, demo cards may render so local portfolios do not look broken. The strict gate applies to configured DB reads and admin publishing.
6. **Null expiry is not "evergreen" for cards.** Gift cards/cashback may be evergreen, but bank/card offers change frequently and the current known bad rows all use null expiry. Cards require an expiry before public publication.
7. **Source URL should be HTTPS.** `URL.canParse("mailto:...")` or `http://...` is not enough for public issuer links.

## Acceptance Criteria

- [x] With current prod-like DB rows (`confidence='needs-verification'`, `expiry_date=null`, "Illustrative"), `/cards` renders the empty state, not the 5 illustrative cards.
- [x] `DATA_SOURCE=static npm run dev` still shows the static/demo cards on `/cards`.
- [x] Creating/updating a draft card offer with incomplete data still succeeds when `is_published` is unchecked.
- [x] Trying to publish a row with placeholder copy, null expiry, non-HTTPS source URL, or `confidence !== "confirmed"` returns a friendly admin error and leaves `is_published` unchanged.
- [x] Once a row is confirmed, has a future/today expiry, a HTTPS source URL, clean copy, and the right headline amount, it can be published and appears on `/cards`.
- [x] `npm run test:admin`, `npm run test:stack`, `npm run lint`, and `npm run build` pass on Node 20.
