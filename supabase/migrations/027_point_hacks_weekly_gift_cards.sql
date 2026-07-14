-- DealStack AU — Point Hacks weekly supermarket gift-card source
--
-- NOT APPLIED TO PRODUCTION. Requires an explicit source-permission review.
-- This migration adds no public data and enables no ingestion. It only lets the
-- existing private gift-card source registry describe an HTML editorial source,
-- then registers Point Hacks with both outbound-request gates closed.

alter table public.gift_card_sources
  drop constraint if exists gift_card_sources_source_type_check;

alter table public.gift_card_sources
  add constraint gift_card_sources_source_type_check
  check (source_type in ('rss', 'atom', 'api', 'html'));

insert into public.gift_card_sources
  (id, name, base_url, feed_url, source_type, enabled,
   automated_fetch_allowed, terms_checked_at, robots_checked_at)
values
  ('pointhacks_weekly_gift_cards',
   'Point Hacks weekly gift-card offers',
   'https://www.pointhacks.com.au',
   'https://www.pointhacks.com.au/weekly-gift-card-offers/',
   'html', false, false, null, null)
on conflict (id) do nothing;
