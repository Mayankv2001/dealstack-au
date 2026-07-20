-- DealStack AU — structured purchase fees and purchase limits
--
-- FORWARD-ONLY / NOT APPLIED. Authored alongside the public value-readiness
-- boundary (lib/giftcards/valueReadiness.ts); the application reads both
-- columns tolerantly and maps their absence to honest nulls, so this
-- migration is additive and can be applied independently of any deploy.
-- Do NOT apply without the standard gated production process
-- (docs/runbooks/MIGRATION-SAFETY.md).
--
-- 1. gift_card_products.purchase_fees — purchase fee per denomination,
--    dollars, keyed by the denomination as text (jsonb object, e.g.
--    {"100": 5.95, "200": 7.95} for eftpos-style cards). NULL = unknown;
--    {} = explicitly recorded fee-free. Fees are a property of buying the
--    product, so they live on the product, not on each promotion.
--
-- 2. gift_card_offers.purchase_limits — structured per-promotion purchase
--    limits (jsonb object): totalCards (total eligible cards per
--    customer/account), fixedValueCardsPerDay, variableLoadCardsPerDay.
--    Fixed-value and variable-load daily caps are DIFFERENT conditions and
--    stay distinct; limit_per_customer keeps the source prose. NULL = the
--    source stated no structured limits.

alter table public.gift_card_products
  add column if not exists purchase_fees jsonb;

comment on column public.gift_card_products.purchase_fees is
  'Purchase fee per denomination in dollars, keyed by denomination as text (e.g. {"100": 5.95}). NULL = unknown; {} = recorded fee-free.';

alter table public.gift_card_products
  drop constraint if exists gift_card_products_purchase_fees_object_check;
alter table public.gift_card_products
  add constraint gift_card_products_purchase_fees_object_check check (
    purchase_fees is null or jsonb_typeof(purchase_fees) = 'object'
  ) not valid;

alter table public.gift_card_offers
  add column if not exists purchase_limits jsonb;

comment on column public.gift_card_offers.purchase_limits is
  'Structured purchase limits: {"totalCards": n, "fixedValueCardsPerDay": n, "variableLoadCardsPerDay": n}. Distinct conditions stay distinct; NULL = not stated. Prose remains in limit_per_customer.';

alter table public.gift_card_offers
  drop constraint if exists gift_card_offers_purchase_limits_object_check;
alter table public.gift_card_offers
  add constraint gift_card_offers_purchase_limits_object_check check (
    purchase_limits is null or jsonb_typeof(purchase_limits) = 'object'
  ) not valid;
