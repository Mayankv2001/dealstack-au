# Gift-card production correction plan — 2026-07-12 audit

Status: **review required; no production corrections applied**.

This is a read-only audit of all 13 production rows where
`gift_card_offers.is_published = true`, captured on 12 July 2026 and rechecked
on 13 July 2026 (Australia/Melbourne). Nine rows link to approved GCDB
candidates/raw items; four are older manual sample rows with no offer-level
candidate linkage. The migration-022 detail schema is present in production
(the remote migration ledger uses timestamped identifiers rather than the
repository's numeric filenames). The `gcdb` source remains `enabled = false` and
`automated_fetch_allowed = false`.

No source article, image, comment, or editorial passage is reproduced here.
Evidence cells link to the relevant factual source page only.

## Executive correction set

- Archive after expiry: 4 rows (Qantas 12551, Apple/Coles 12540,
  Luxury/Coles 12386, Giftz 12716).
- Update active data: 4 rows (Big W Apple, Coles Restaurant/Uber,
  Woolworths TCN, Card.Gift TCN).
- Split before any replacement is published: 1 Amazon compound row.
- Unpublish for insufficient offer-level evidence: 4 legacy sample rows.
- Missing reviewed opportunities: Myer bonus value (12844), Woolworths Apple
  points (12845), and the Macquarie ongoing catalogue (4897).
- Exact duplicate published rows: none. The legacy Woolworths Apple sample is
  a probable duplicate/superseded representation of queued source offer 12845.

## Complete published-offer audit (13 of 13)

Compatibility uses the required public vocabulary: **Compatible**, **Likely
compatible**, **Verify stacking**, **Incompatible**, **Insufficient evidence**.

| Offer ID | Seller | Source | Current mechanic | Verified mechanic | Current dates | Verified dates | Current value | Verified value | Current compatibility | Proposed compatibility | Duplicate / compound risk | Missing fields | Proposed action | Evidence | Confidence | Production write ready? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gc-amazon-airbnb-accor-hotels-autobarn-bunnings-warehouse-qanta` | Qantas Marketplace | GCDB 12551; candidate `fc0607cc-e0ea-425f-a807-5ffdcf29ee04`; raw `39e10f62-4fc8-44a1-a4b1-8a5832d75c65` | Points multiplier | Compound points campaign | none | 2026-06-24 to 2026-07-02; expired | 3× Qantas across Amazon, Airbnb, Accor, Autobarn, Bunnings | 3× Amazon/Airbnb/Bunnings; 4× Accor; 10× Autobarn | Verify stacking | Incompatible | Compound: several multipliers flattened to 3×; not a duplicate | start/end; per-product multipliers; Qantas membership requirement; online/payment condition | **archive after expiry** | [GCDB offer 12551](https://gcdb.com.au/offer/12551/), [Qantas Marketplace overview](https://gcdb.com.au/store/qantas-marketplace/) | High | Yes, after row review: set exact dates, correct compound note, unpublish/archive |
| `gc-amazon-ultimate-active-wellness-ultimate-baby-mum-ultimate-b` | Amazon | GCDB 12680; candidate `059b2c08-8ccd-44a3-87b8-e8fd6fc5ec2f`; raw `9912122c-6134-45b6-91b6-fba5d19ab160` | 10% percentage discount across 33 brands | Mixed compound: percentage discounts, fixed-dollar discount, seller promo credits, fee waiver, expired children and targeted variant | start missing; ends 2026-07-13 | parent published 2026-07-07 and ended 2026-07-13; child expiry/stock state differs | broad 10% | Active/general children shown by source: 10% Uber; 10% Harris Farm/The Iconic/Amart; $10 off $100 selected gaming; $10 Amazon credit on $100 Apple; $10 Amazon credit on $250 Amazon; fee waived on $100/$150 Activ Visa. 8% Ultimate and 15% DoorDash were already expired. Prime required; a $20/$100 variant was targeted | Verify stacking | Verify stacking per child | Severe compound flattening; targeted/general eligibility mixed; no exact published duplicate | stable child keys; individual products, mechanic, amount, threshold, expiry/stock state, Prime flag, targeting, activation, official child terms | **split** | [GCDB offer 12680](https://gcdb.com.au/offer/12680/) | Medium: mechanics are clear; individual official terms/links must be rechecked | **No.** Unpublish broad parent only after the reviewed replacement set and official child terms are ready |
| `gc-apple-big-w` | Big W | GCDB 12783; candidate `dda566a3-4256-46ea-9470-7fc8799680f5`; raw `964b89d5-6652-4fa5-abe0-c3df018159d7` | Points multiplier | Points multiplier | none | 2026-07-09 to 2026-07-15 | 20× Everyday Rewards | 20× Everyday Rewards; in-store; 10 cards; open to everyone; no activation | Verify stacking | Verify stacking | Same brand/mechanic as queued Woolworths 12845, but different seller/dates; not duplicate | start/end; in-store method; limit 10; explicit no membership/no activation | **update** | [GCDB offer 12783](https://gcdb.com.au/offer/12783/) | High | Yes, after row review |
| `gc-apple-coles` | Coles | GCDB 12540; candidate `bfba6ffd-ef5f-4b82-8afb-809c4003b521`; raw `6cc689d7-a408-452b-b0e9-2b6c26579ff3` | Points multiplier | Points multiplier | none | 2026-07-01 to 2026-07-07; expired | 20× Flybuys | 20× Flybuys; in-store; 5 cards/day/Flybuys account; open to everyone; no activation | Verify stacking | Incompatible | Expired predecessor only; not duplicate of current Big W/Woolworths sellers | start/end; in-store method; daily/account limit; expiry state | **archive after expiry** | [GCDB offer 12540](https://gcdb.com.au/offer/12540/) | High | Yes, after row review |
| `gc-apple-points` | Woolworths supermarkets | `Woolworths in-store promo`; generic GCDB homepage; no candidate/raw linkage | Stored as 0% discount with vague `points_on_purchase` sample text | Not verifiable as this row. A distinct queued offer 12845 is 20× Everyday Rewards | 2026-06-08 to 2026-07-24 | This row has no verifiable dates. Replacement candidate 12845 is 2026-07-15 to 2026-07-21 | no structured multiplier/programme; sample note | Replacement source: 20× Everyday Rewards; in-store; 10/day; open to everyone; no activation | Verify stacking | Insufficient evidence | Probable duplicate/superseded row for queued Woolworths Apple 12845; generic source URL collision is not exact identity | offer-level source; correct type/value; dates; programme; seller terms; remove all sample wording | **unpublish** | [GCDB offer 12845](https://gcdb.com.au/offer/12845/), [Apple offer index](https://gcdb.com.au/gc/apple/) | High that current row is unsafe; high on replacement facts | Yes: unpublish only. Replacement approval is a separate reviewed action |
| `gc-coles-group-bonus-points` | Coles supermarkets & Coles Online | `Coles in-store promo`; generic GCDB homepage; no candidate/raw linkage | Stored as 0% discount with a sample 2,000 Flybuys note | Insufficient evidence | 2026-06-08 to 2026-09-30 | not verified | vague 2,000 points on $100+, but no structured programme/type and sample text | not verified | Verify stacking | Insufficient evidence | No matching offer-level source; generic URL shared by unrelated samples | exact source, correct mechanic, threshold, programme, dates, channel (in-store vs online), terms | **unpublish** | [GCDB Coles store index](https://gcdb.com.au/store/coles/) | High that row is unsafe; low on claimed campaign | Yes: unpublish only |
| `gc-luxury-escapes-event-cinemas-village-cinemas-coles` | Coles | GCDB 12386; candidate `812eca63-fba4-4dee-85ef-3fb7b288410b`; raw `b3400ab9-8dbb-46e1-b69c-fbcd24de1dd1` | Points multiplier | Points multiplier | none | 2026-06-24 to 2026-06-30; expired | 20× Flybuys | 20× Flybuys; in-store; 5 cards/day; 50,000-point account cap; open to everyone; no activation | Verify stacking | Incompatible | Not duplicate | start/end; limits; cap type; in-store; no activation; exact included products by region | **archive after expiry** | [GCDB offer 12386](https://gcdb.com.au/offer/12386/) | High | Yes, after row review |
| `gc-restaurant-cafe-choice` | NRMA Blue member portal | `NRMA Blue`; generic GCDB homepage; no candidate/raw linkage | 10% member-portal discount | Current NRMA catalogue exists, but this exact Restaurant & Cafe Choice rate is not publicly verifiable | 2026-06-01 to 2026-07-31 | not verified; catalogue nature should not use invented temporary dates | 10%, $250 cap, marked confirmed; membership flag false; sample limit text | not verified | Likely compatible | Insufficient evidence | Not a duplicate of the Coles campaign (different seller/channel); should eventually be a programme rate | exact product/rate evidence; membership flag; payment requirement; checked/review-by date; remove sample text | **unpublish** | [NRMA eGift-card catalogue](https://nrma.clubconnect.com.au/en/things-to-do/egift-cards), [NRMA eGift terms](https://benefits.mynrma.com.au/en/egift-card-terms-and-faqs) | High that membership/catalogue modelling is required; low on exact 10% row | Yes: unpublish only; later **convert to programme rate** after authenticated evidence review |
| `gc-restaurant-choice-uber-uber-eats-coles` | Coles | GCDB 12676; candidate `ead14260-9e6e-4f5a-b777-bb0d9357b15e`; raw `a5471694-7e58-428a-99ee-fdb46d75ab4b` | Percentage discount | Percentage discount | none | 2026-07-08 to 2026-07-14 | 10% | 10%; in-store; 5 cards/customer; Restaurant Choice $100 and $50–500 variable; Uber $50 and $20–500 variable | Verify stacking | Verify stacking | Brand overlap with NRMA row, but different seller/channel/source; not duplicate | start/end; in-store method; 5-card limit; denominations | **update** | [GCDB offer 12676](https://gcdb.com.au/offer/12676/), [weekly source summary](https://gcdb.com.au/article/weekly-gift-card-offers/) | High | Yes, after row review |
| `gc-tcn-baby-tcn-gift-tcn-teen-tcn-deluxe-the-holiday-hotel-wool` | Woolworths | GCDB 12677; candidate `93beae80-7732-4806-ae7d-8d0fbe8457b9`; raw `ae275d2f-d9e9-4535-9894-84a547774d8b` | Points multiplier | Points multiplier | none | 2026-07-08 to 2026-07-14 | 20× Everyday Rewards | 20× Everyday Rewards; in-store; open to everyone; no activation. Variable-load TCN Teen excluded. $100 TCN Gift and variable TCN Deluxe/Holiday & Hotel: 2/day; other eligible cards: 10/day | Verify stacking | Verify stacking | Not duplicate | start/end; exact denominations/exclusion; per-product daily limits; in-store; explicit no activation | **update** | [GCDB offer 12677](https://gcdb.com.au/offer/12677/), [weekly source summary](https://gcdb.com.au/article/weekly-gift-card-offers/) | High | Yes, after row review |
| `gc-tcn-love-tcn-shop-tcn-cinema-tcn-good-food-card-gift` | Card.Gift | GCDB 12870; candidate `1040cd89-ce97-4b60-9f46-3da61d693f92`; raw `525060cd-5920-4a7c-9feb-b81bf481e8ca` | Percentage discount | Percentage discount | start missing; ends 2026-07-17 | 2026-07-10 to 2026-07-17, 23:59 AEST | 10% | 10%; code `FEELING10`; physical/digital; one use/customer; $3,000 eligible value/customer; AU only; shipping may apply; cannot combine with another seller offer | Verify stacking | Verify stacking | Not duplicate; coherent four-product bundle, not compound mechanics | start; time/timezone; code; coupon flag; cap; use count; format; AU/shipping/combinability; terms URL | **update** | [GCDB offer 12870](https://gcdb.com.au/offer/12870/), [Card.Gift terms](https://card.gift/terms-and-conditions) | High | Yes, after row review |
| `gc-uber-uber-eats-harris-farm-ultimate-active-wellness-giftz-co` | Giftz.com.au | GCDB 12716; candidate `cf2b9474-f7cf-40d8-890f-cd6ef6b4543e`; raw `1ae5ab53-42ba-472e-ad9c-92b50edee538` | Percentage discount | Percentage discount | none | 2026-07-02 09:00 AEST to 2026-07-09 23:59; expired | 10% | 10%; code `WINTER`; AU residents; maximum $500 discount/$5,000 purchase/50 cards per order; while stocks last; cannot combine unless specified | Verify stacking | Incompatible | Product overlap with Coles Uber campaign, but different seller/dates; not duplicate | start/end/time; code/coupon; cap/limit; AU flag; combinability; terms | **archive after expiry** | [GCDB offer 12716](https://gcdb.com.au/offer/12716/) | High | Yes, after row review |
| `gc-ultimate-jbhifi` | RACV Member Benefits portal | `RACV Member Benefits`; generic GCDB homepage; no candidate/raw linkage | 5% member-portal discount | RACV operates a changing eGift catalogue; exact Ultimate 5% row is not publicly verifiable | 2026-06-01 to 2026-07-15 | not verified | 5%; marked confirmed; membership flag false; sample limit | Public RACV evidence only establishes member-only eGift cards with product-specific rates (currently advertised as 2–9%), not this exact row | Likely compatible | Insufficient evidence | Programme/catalogue row; generic URL; no exact duplicate | exact product/rate evidence; membership flag; source/terms URL; payment requirement; checked/review-by; remove sample text | **unpublish** | [RACV eGift cards](https://www.racv.com.au/membership/member-discounts/shopping/egiftcards.html), [RACV member-benefit terms](https://www.racv.com.au/membership/member-discounts/member-benefits-terms-conditions.html) | High that current row lacks evidence; medium on catalogue shape | Yes: unpublish only; later **convert to programme rate** after member-side verification |

## Exact correction payloads ready for row review

These are proposed values only. They have **not** been sent to production.

1. `gc-apple-big-w`: `start_date=2026-07-09`,
   `expiry_date=2026-07-15`, `promotion_type=points`,
   `points_multiplier=20`, `points_program=Everyday Rewards`,
   `purchase_method=in-store`, `membership_required=false`,
   `activation_required=false`, `limit_per_customer=10 gift cards`.
2. `gc-restaurant-choice-uber-uber-eats-coles`:
   `start_date=2026-07-08`, `expiry_date=2026-07-14`,
   `promotion_type=discount`, `discount_percent=10`,
   `purchase_method=in-store`, `limit_per_customer=5 gift cards`.
3. `gc-tcn-baby-tcn-gift-tcn-teen-tcn-deluxe-the-holiday-hotel-wool`:
   `start_date=2026-07-08`, `expiry_date=2026-07-14`,
   `promotion_type=points`, `points_multiplier=20`,
   `points_program=Everyday Rewards`, `purchase_method=in-store`,
   `membership_required=false`, `activation_required=false`; retain the
   product-specific exclusion/limits as structured denomination/limit data.
4. `gc-tcn-love-tcn-shop-tcn-cinema-tcn-good-food-card-gift`:
   `start_date=2026-07-10`, `expiry_date=2026-07-17`,
   `expiry_time=23:59`, `expiry_timezone=AEST`, `promo_code=FEELING10`,
   `coupon_required=true`, `cap_dollars=3000`, `uses_per_customer=1`,
   `format=digital-and-physical`, `shipping_may_apply=true`,
   `australia_only=true`, `combinable_with_seller_promotions=false`,
   `terms_url=https://card.gift/terms-and-conditions`.
5. Expired rows to date-correct and archive/unpublish:
   Qantas 12551 (`2026-06-24`–`2026-07-02`), Apple/Coles 12540
   (`2026-07-01`–`2026-07-07`), Luxury/Coles 12386
   (`2026-06-24`–`2026-06-30`), Giftz 12716
   (`2026-07-02`–`2026-07-09`).
6. Legacy rows to unpublish without replacement in the same operation:
   `gc-apple-points`, `gc-coles-group-bonus-points`,
   `gc-restaurant-cafe-choice`, `gc-ultimate-jbhifi`.

The Amazon broad parent is deliberately absent from the write-ready list. The
gaming link currently does not provide reliable matching terms, and each active
child needs an official Amazon terms check before replacement rows are safe.

## Missing offers / programme entries

| Source item | Verified facts | Required handling |
|---|---|---|
| [GCDB 12844 — Myer at Coles](https://gcdb.com.au/offer/12844/) | 10% bonus face value on $50/$100/$200 Myer cards; 2026-07-15 to 2026-07-21; in-store; limit 5. Effective value is about 9.09%, not a 10% checkout discount | Review as `bonus-value`; do not approve the current wrongly typed candidate until its type/dates/value are corrected |
| [GCDB 12845 — Apple at Woolworths](https://gcdb.com.au/offer/12845/) | 20× Everyday Rewards; 2026-07-15 to 2026-07-21; in-store; 10/day; open to everyone; no activation | Review as a new points offer only after `gc-apple-points` is approved for unpublish |
| [GCDB 4897 — Macquarie Marketplace](https://gcdb.com.au/offer/4897/) | Explicit ongoing catalogue; Macquarie account required; payment comes from the Macquarie balance; product-specific rates checked 2026-06-25 | Create programme + product-rate records under migration 024; never publish one broad “up to 10%” temporary offer |

RACV and NRMA should use the same programme model after authenticated catalogue
evidence is reviewed: one provider/programme row, stable product-rate keys,
membership/account/payment requirements, explicit ongoing status, finite review
deadline, and immutable added/removed/increased/decreased rate history.

## Application order after explicit approval

1. Review and approve the exact row list and values above.
2. Apply migration 023, regenerate Supabase types from the migrated schema, and
   deploy the matching app safeguards. Do not enable ingestion.
3. Apply only the approved update/archive/unpublish operations through an
   audited admin workflow or a separately reviewed correction migration.
4. Re-run the public query and confirm expired/sample rows are gone.
5. Separately review Amazon child terms and programme/catalogue seed data.
6. Apply migration 024 only when the first programme catalogue rows have been
   reviewed. Migration 024 itself contains no seed data.

Production corrections are **not ready to execute as a batch** until the user
approves the rows. The non-Amazon row values above are technically ready for
row-by-row review; Amazon remains blocked on exact official child terms.
