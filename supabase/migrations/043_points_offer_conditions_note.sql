-- 043_points_offer_conditions_note.sql
--
-- points_offers could state WHAT you earn (earn_rate_display) but nothing about
-- the conditions attached to earning it — purchase limits, fees, whether the
-- offer is in-store only, whether it needs activation, when points credit. Two
-- offers can share a headline and differ entirely on those terms: a "limit five
-- per day" is a very different offer from a "limit five in total".
--
-- Deliberately the same shape as points_transfer_bonuses.conditions_note
-- (migration 040): one short, nullable, DealStack-authored note. Never copied
-- source prose — we record the facts in our own words, exactly as every other
-- free-text offer field in this schema does.
--
-- Nullable, so every existing row keeps its current meaning: no note = no
-- conditions recorded, and the card simply omits the block. RLS is unchanged;
-- this adds a display field, not a publication gate.

alter table public.points_offers
  add column if not exists conditions_note text;

comment on column public.points_offers.conditions_note is
  'Our own short note on the conditions — limits, fees, channel, activation, crediting time. Never copied source prose. Null = none recorded.';
