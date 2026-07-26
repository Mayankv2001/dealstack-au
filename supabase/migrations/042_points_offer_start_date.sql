-- 042_points_offer_start_date.sql
--
-- points_offers could express "ends on" but not "starts on", so a promotion
-- with a future start had to be held back as an unpublished draft and remembered
-- manually. gift_card_offers has had `start_date` and an upcoming display tier
-- since 021; this brings points offers to the same contract.
--
-- Display policy is deliberately IDENTICAL to the gift-card one
-- (lib/giftcards/currentOffers.ts): a reviewed offer starting within
-- UPCOMING_DISPLAY_WINDOW_DAYS (7) is shown AFTER active offers, always
-- labelled "Starts D Mon YYYY", and NEVER counted as an active earn rate by the
-- stack engine. Rows starting beyond the window stay hidden.
--
-- Nullable, so every existing row keeps its current meaning: no start date =
-- already running. RLS is intentionally unchanged — the published read set now
-- legitimately includes near-future rows, and the window/labelling is a display
-- concern enforced in the read path, exactly as it is for gift cards.

alter table public.points_offers
  add column if not exists starts_on date;

comment on column public.points_offers.starts_on is
  'Date the offer begins (AU calendar). Null = already running. Rows starting within 7 days are shown as "Starts …"; beyond that they are hidden. Never treated as an active earn rate before this date.';

-- A promotion cannot end before it begins.
alter table public.points_offers
  drop constraint if exists points_offers_start_before_expiry_check;
alter table public.points_offers
  add constraint points_offers_start_before_expiry_check
  check (starts_on is null or expiry_date is null or starts_on <= expiry_date);

create index if not exists idx_points_offers_starts_on
  on public.points_offers (starts_on)
  where starts_on is not null;
