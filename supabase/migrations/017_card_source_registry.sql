-- DealStack AU — card-offer source registry (compliance decision + disabled feed)
--
-- Data-only migration (no schema change): records the compliance decision for
-- automating credit-card offer discovery, and registers the one source that
-- passed review. See docs/bank-card-offer-workflow.md and
-- docs/ozbargain-monitoring.md (compliance decision log) for the write-up.
--
-- Decision, recorded 2026-07-11:
--   * Finder.com.au (credit card comparison) was evaluated and REJECTED as an
--     automation source. It publishes no RSS/Atom feed or public API for card
--     offers (confirmed via its robots.txt: the only API path present,
--     /wp-json/finder/v1/geoip/..., is unrelated to card data and is itself
--     disallowed). Automating discovery there would mean HTML scraping, which
--     this project's architecture rule prohibits outright regardless of what
--     any robots.txt allows ("RSS/Atom feed parsing only — no HTML scraping",
--     CLAUDE.md). No fetcher for Finder is planned or built.
--   * OzBargain's Credit Card tag feed was verified instead: a live RSS 2.0
--     feed at https://www.ozbargain.com.au/tag/credit-card/feed (channel
--     title "OzBargain - Credit Card"), confirmed live 2026-07-11. Its
--     robots.txt places no Disallow on /tag/ or /feed paths. This is the same
--     already-approved OzBargain compliance review and feed-only posture the
--     monitor already operates under (source_type = 'ozbargain', already in
--     APPROVED_FEED_SOURCE_TYPES) — no new fetching capability is added here,
--     only a new row in the existing allowlist, and it is inserted DISABLED.
--
-- This feed is registered for a future card-offer DETECTION-ASSIST phase
-- (staging change candidates into offer_change_candidates for admin review,
-- the same pattern used for cashback/gift-card/points detection) — it is not
-- itself card_offers automation. card_offers stays manual-entry-only per
-- docs/bank-card-offer-workflow.md: admins verify against each issuer's own
-- public page before publishing; nothing here changes that.
--
-- Both inserts are guarded so this migration is safely re-runnable.

insert into public.feed_sources (label, feed_url, kind, source_type, is_enabled)
select
  'OzBargain — Credit Card tag feed',
  'https://www.ozbargain.com.au/tag/credit-card/feed',
  'category',
  'ozbargain',
  false
where not exists (
  select 1 from public.feed_sources
  where feed_url = 'https://www.ozbargain.com.au/tag/credit-card/feed'
);

insert into public.compliance_reviews (
  source_name, robots_txt_checked, terms_checked, feed_paths_allowed,
  user_agent_recorded, rate_limit_recorded, approved_for_monitoring,
  reviewer_email, notes, reviewed_at
)
select
  'Finder.com.au (credit card comparison)',
  true,
  true,
  false,
  false,
  false,
  false,
  'mv2001erma@gmail.com',
  'Rejected as an automation source: no RSS/Atom feed or public API for card '
    || 'offers (robots.txt shows only an unrelated, disallowed geoip API path). '
    || 'Automating discovery would require HTML scraping, which this project '
    || 'does not do regardless of robots.txt. No fetcher planned or built. '
    || 'Card-offer detection-assist instead uses the OzBargain Credit Card tag '
    || 'feed (see the feed_sources row added in this same migration) — issuer '
    || 'pages remain the manual verification source of truth for publishing.',
  now()
where not exists (
  select 1 from public.compliance_reviews
  where source_name = 'Finder.com.au (credit card comparison)'
);
