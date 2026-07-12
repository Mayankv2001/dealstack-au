# Gift-card offer correction proposal — 2026-07-12

Read-only audit of every **published** `gift_card_offers` row in production
(13 rows: 9 approved from the GCDB review queue on 2026-07-12, 4 older
manual/sample rows). **No production data has been changed.** Each correction
must be verified at the cited source before being applied — nothing below is
an invented value. Fields marked *(022)* need migration
`022_gift_card_offer_detail.sql` applied first.

Legend for the "needs" column: **EXP** expiry correction · **SEL** seller
correction · **PRG** programme/promotion-type correction · **CODE** promo code
· **CAP** purchase cap · **PROD** included products *(022)* · **MCC** MCC data
*(022 + product records)* · **TERMS** terms URL *(022)*.

## GCDB-approved 2026-07-12 (9 rows)

All nine share three systemic gaps: no product records are linked
(**PROD**/**MCC** apply to every row), no official terms URL (**TERMS**), and
`format` is `unknown`. Row-specific issues:

| Offer id | Promotion | Needs | Notes |
|---|---|---|---|
| `gc-tcn-love-tcn-shop-tcn-cinema-tcn-good-food-card-gift` | 10% off 4 TCN cards at Card.Gift, exp 17 Jul | **CODE, CAP, PROD, TERMS** + expiry time | Flagship correction. Owner-supplied example says: code FEELING10, ends 11:59 PM AEST, $3,000 cap, one use per customer, physical+digital, AU-only, shipping may apply, cannot combine with another Card.Gift promo — **verify each at gcdb.com.au/offer/12870 and the Card.Gift terms page before applying**. |
| `gc-amazon-ultimate-…` (33-brand list) | 10% off at Amazon, exp 13 Jul | **CAP, PROD** | Amazon GC promos are typically capped per account — verify at offer/12680. The 33-brand `brand` string should become included-product links once product records exist. |
| `gc-apple-big-w` | 20× Everyday Rewards at Big W | **EXP** | Extractor warned "No end date found". Weekly catalogue promos always end — verify at offer/12783; if genuinely open-ended, re-approve marked *ongoing*. |
| `gc-apple-coles` | 20× Flybuys at Coles | **EXP** | Same no-end-date gap — verify at offer/12540. |
| `gc-luxury-escapes-event-cinemas-village-cinemas-coles` | 20× Flybuys at Coles | **EXP, PROD** | No end date — verify at offer/12386. |
| `gc-restaurant-choice-uber-uber-eats-coles` | 10% off at Coles | **EXP, CAP** | Supermarket % promos are weekly and usually capped — verify at offer/12676. |
| `gc-tcn-baby-tcn-gift-tcn-teen-tcn-deluxe-the-holiday-hotel-wool` | 20× Everyday Rewards at Woolworths | **EXP, PROD** | No end date — verify at offer/12677. |
| `gc-uber-uber-eats-harris-farm-ultimate-…-giftz-co` | 10% off at Giftz.com.au | **EXP, CAP, PROD** | No end date — verify at offer/12716. |
| `gc-amazon-airbnb-accor-…-qanta` | 3× Qantas Points at Qantas Marketplace | **EXP, PROD** | No end date — verify at offer/12551. Truncated 64-char id is cosmetic only (slug cap); no action needed. |

## Older manual/sample rows (4)

| Offer id | Needs | Notes |
|---|---|---|
| `gc-apple-points` (Woolworths) | **PRG, EXP-check, TERMS** + remove "Sample:" prose | `promotion_type='discount'` with 0% but the value is bonus points — should be re-typed as a points promotion with a real multiplier, or replaced by the fresh Woolworths Apple 20× candidate (conf 0.85) still sitting in the review queue. `points_on_purchase.earnNote` and `limit_per_customer` still say "Sample:". Citation is the bare gcdb.com.au root, not an offer page. |
| `gc-coles-group-bonus-points` | **PRG, TERMS** + remove "Sample:" prose | Same shape: `discount` type, 0%, sample-worded Flybuys bonus, root-URL citation. |
| `gc-restaurant-cafe-choice` (NRMA Blue) | **TERMS** + staleness | `confidence='confirmed'` but last checked 2026-05-20 (> 21-day stale threshold) and `limit_per_customer` says "(sample)". Re-verify or downgrade confidence. |
| `gc-ultimate-jbhifi` (RACV) | **TERMS** + expiry watch | Expires 2026-07-15 (3 days) — RLS keeps it visible until then; re-verify or let it lapse. "(sample)" wording in `limit_per_customer`. |

## Duplicate-risk note

The still-queued Woolworths Apple 20× Everyday Rewards candidate overlaps
`gc-apple-points` and `gc-apple-big-w` covers the same brand at a different
seller. When reviewing the queue, either approve the fresh candidate **and**
unpublish `gc-apple-points`, or reject the candidate as a duplicate — don't
publish both.

## Application order (after review sign-off)

1. Apply migration 022 + `npm run types:gen` (enables CODE/CAP-time/PROD/TERMS fields).
2. Re-verify each row at its cited source URL.
3. Apply corrections through the admin edit UI (audited) — not raw SQL — so
   every change lands in `audit_log`.
4. Create `gift_card_products` + acceptance rows for the TCN/Ultimate/Apple
   card families to unlock the MCC/acceptance sections.
