-- 044_points_offer_fixed_points.sql
--
-- points_offers could record a RATE (earn_multiple, "20x per $1") but not a
-- one-off AWARD ("2,000 points per card"). Offers of the second kind carried
-- the figure only inside earn_rate_display, which is editorial copy — so every
-- surface that wants the number either had to parse that prose or go without.
-- The homepage carousel went without, and showed a bare "POINTS" badge beside
-- offers whose whole point is the size of the award.
--
-- Deliberately the same shape and name as gift_card_offers.fixed_points, which
-- has modelled exactly this since migration 023. Numeric, not integer, to match
-- that column and earn_multiple beside it.
--
-- NOT mutually exclusive with earn_multiple by constraint: an offer can
-- legitimately pay a base multiplier AND a one-off bonus, and a CHECK here
-- would block recording that truthfully. Where a display can show only one,
-- the multiplier wins — it is the rate that scales with what you spend.
--
-- Nullable, so every existing row keeps its current meaning: no fixed award
-- recorded. RLS is unchanged; this adds a display/valuation field, not a
-- publication gate.

alter table public.points_offers
  add column if not exists fixed_points numeric;

comment on column public.points_offers.fixed_points is
  'One-off points award for this offer, e.g. 2000 for "2,000 points per card". Null = none; a per-dollar rate lives in earn_multiple instead.';
