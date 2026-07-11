-- DealStack AU — card-offer change candidates (detection-assist, staging only)
--
-- Widens offer_change_candidates to carry card-offer detections alongside the
-- existing cashback/gift_card/points/promo types, and adds a small structured
-- payload for admin-review prefill (bonus points, annual fee, etc.) — a card
-- offer changes multiple fields at once, which the existing single
-- detected_rate_or_discount/proposed_value strings cannot carry on their own.
--
-- Detection itself is flag-gated (CARD_DETECT_ENABLED, default off) and stays
-- entirely within this staging table. Applying a candidate remains a separate,
-- authenticated admin decision; the application planner cannot change publish
-- or archive state.

alter table public.offer_change_candidates
  drop constraint if exists offer_change_candidates_source_type_check;
alter table public.offer_change_candidates
  add constraint offer_change_candidates_source_type_check
  check (source_type in ('cashback', 'gift_card', 'points', 'promo', 'card_offer'));

alter table public.offer_change_candidates
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.offer_change_candidates
  drop constraint if exists offer_change_candidates_payload_object;
alter table public.offer_change_candidates
  add constraint offer_change_candidates_payload_object
    check (jsonb_typeof(payload) = 'object');

-- The review queue lists by source_type within the 'new' triage state (a
-- filtered/tabbed view, same access pattern as the existing review_state
-- index from migration 004).
create index if not exists idx_offer_change_candidates_source_type
  on public.offer_change_candidates (source_type)
  where review_state = 'new';
